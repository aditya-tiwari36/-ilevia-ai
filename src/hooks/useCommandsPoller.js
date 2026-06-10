import { useCallback, useEffect, useRef, useState } from "react";
import { appendToHistory, computeBatchStats } from "../services/CommandService.js";
import { applyCommandsWithPriority } from "../services/DeviceStateService.js";

const POLL_INTERVAL_MS = 5_000;        // 5 seconds — live sync with ML pipeline
const SLOW_POLL_INTERVAL_MS = 60_000;  // 60 seconds — model status + device state

/**
 * useCommandsPoller
 *
 * Continuously polls /api/commands every 5 seconds.
 * Falls back to static ML_algorithm/commands.json if API is unreachable.
 * Implements "human wins" via humanLocks ref passed from context.
 *
 * Returns:
 *   commandsPayload  — { generated_at, commands[], history{} }
 *   commandHistory   — per-device history map { [deviceId]: entry[] }
 *   overrides        — override_events.json contents (array)
 *   setOverrides     — setter for optimistic override additions
 *   pollStats        — { count, lastPollAt, latencyMs, source, batchStats }
 *   isLoading        — true until first successful fetch
 */
export function useCommandsPoller(setDevices, humanLocksRef) {
  const [commandsPayload, setCommandsPayload] = useState({
    generated_at: null,
    commands: [],
    history: {}
  });
  const [commandHistory, setCommandHistory] = useState({});
  const [overrides, setOverrides] = useState([]);
  const [modelStatus, setModelStatus] = useState(null);
  const [deviceState, setDeviceState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pollStats, setPollStats] = useState({
    count: 0,
    lastPollAt: null,
    latencyMs: null,
    source: null,  // "api" | "fallback"
    batchStats: null
  });

  // Track previous generated_at to detect when pipeline writes a fresh file
  const prevGeneratedAt = useRef(null);

  const applyBatch = useCallback((commands, generatedAt, source) => {
    const now = new Date().toISOString();
    setCommandsPayload(prev => ({ ...prev, commands, generated_at: generatedAt }));
    setCommandHistory(prev => appendToHistory(prev, commands, now));

    setDevices(current => {
      const locks = humanLocksRef?.current ?? {};
      const { nextDevices } = applyCommandsWithPriority(current, commands, locks);
      return nextDevices;
    });

    const batchStats = computeBatchStats(commands);
    setPollStats(prev => ({
      count: prev.count + 1,
      lastPollAt: now,
      latencyMs: prev._pollStartMs ? Date.now() - prev._pollStartMs : null,
      source,
      batchStats,
      _pollStartMs: null
    }));
  }, [setDevices, humanLocksRef]);

  const poll = useCallback(async () => {
    const pollStart = Date.now();
    // Mark start time for latency calculation
    setPollStats(prev => ({ ...prev, _pollStartMs: pollStart }));

    try {
      // Fix 4.7: only fetch commands + overrides in the 5-second critical path.
      // model-status and device-state have been moved to a separate 60-second slow poll.
      const [commandsRes, overridesRes] = await Promise.all([
        fetch("/api/commands"),
        fetch("/api/overrides")
      ]);

      if (!commandsRes.ok) throw new Error(`commands: ${commandsRes.status}`);

      const payload = await commandsRes.json();
      const overrideEvents = await overridesRes.json().catch(() => []);

      // Only update command history if ML wrote a fresh file
      const isNewBatch = payload.generated_at !== prevGeneratedAt.current;
      prevGeneratedAt.current = payload.generated_at;

      if (isNewBatch || !payload.generated_at) {
        applyBatch(payload.commands ?? [], payload.generated_at, "api");
      } else {
        // Same batch — just update poll stats without re-applying
        setPollStats(prev => ({
          ...prev,
          count: prev.count + 1,
          lastPollAt: new Date().toISOString(),
          latencyMs: Date.now() - pollStart,
          source: "api",
          _pollStartMs: null
        }));
      }

      setOverrides(Array.isArray(overrideEvents) ? overrideEvents : []);
    } catch {
      // API unreachable — fall back to bundled JSON (dev mode without backend)
      try {
        const local = await import("../../commands.json");
        const isNewBatch = local.default.generated_at !== prevGeneratedAt.current;
        prevGeneratedAt.current = local.default.generated_at;

        if (isNewBatch) {
          applyBatch(local.default.commands ?? [], local.default.generated_at, "fallback");
        } else {
          setPollStats(prev => ({
            ...prev,
            count: prev.count + 1,
            lastPollAt: new Date().toISOString(),
            latencyMs: Date.now() - pollStart,
            source: "fallback",
            _pollStartMs: null
          }));
        }
      } catch {
        // No fallback — keep current state
        setPollStats(prev => ({
          ...prev,
          count: prev.count + 1,
          lastPollAt: new Date().toISOString(),
          latencyMs: Date.now() - pollStart,
          source: "error",
          _pollStartMs: null
        }));
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyBatch]);

  useEffect(() => {
    poll(); // immediate first load
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  // Fix 4.7: Slow poll for model-status and device-state (60s).
  // These endpoints read model_metrics.csv + commands.json + make an outbound
  // fetch to the Python server — too expensive for the 5-second critical path.
  useEffect(() => {
    async function slowPoll() {
      try {
        const [modelRes, deviceRes] = await Promise.all([
          fetch("/api/model-status"),
          fetch("/api/device-state")
        ]);
        if (modelRes.ok) setModelStatus(await modelRes.json());
        if (deviceRes.ok) setDeviceState(await deviceRes.json());
      } catch {
        // Non-critical — fail silently if Python server unreachable
      }
    }
    slowPoll(); // immediate first load
    const id = window.setInterval(slowPoll, SLOW_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return {
    commandsPayload,
    commandHistory,
    setCommandHistory,
    overrides,
    setOverrides,
    modelStatus,
    deviceState,
    pollStats,
    isLoading
  };
}
