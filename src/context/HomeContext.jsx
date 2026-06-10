import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { rooms, weatherByLocation } from "../data/home.js";
import { buildInitialDevices } from "../lib/smartHome.js";
import { useCommandsPoller } from "../hooks/useCommandsPoller.js";
import { buildOverrideEvent, persistOverride, overridesForDevice } from "../services/OverrideService.js";
import { recordHumanAction, pruneExpiredLocks, deviceStateSummary } from "../services/DeviceStateService.js";
import { getDeviceHistory, appendToHistory } from "../services/CommandService.js";
import { generateSimulatedDeltas, simulatedDeltasToCommands } from "../services/SimulationEngine.js";
import { applyCommandsWithPriority } from "../services/DeviceStateService.js";

const HomeContext = createContext(null);

export function HomeProvider({ children }) {
  // ── Navigation ──────────────────────────────────────────────────────────
  const [section, setSection] = useState("room");
  const [activeRoom, setActiveRoom] = useState("Living Room");
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [demoMode, setDemoMode] = useState(false);

  // ── Device state ────────────────────────────────────────────────────────
  const [devices, setDevices] = useState(() => buildInitialDevices(rooms));

  // ── Human locks (per-parameter, time-bounded) ────────────────────────────
  // Stored in a ref so the poller can read the latest value without stale closure
  const humanLocksRef = useRef({});

  // ── Weather / location ───────────────────────────────────────────────────
  const [weatherLocation, setWeatherLocation] = useState("Mumbai");

  // ── Simulation params (shared with SimulationSection) ───────────────────
  const [simParams, setSimParams] = useState({
    hour: 8,
    month: "June",
    season: "Monsoon",
    compression: 120,
    occupancy: { Occupancy: false, Presence: false, "Arrives Home": false, "Leaves Home": false },
    roomOccupancy: { "Living Room": true, "Master Bedroom": false, "Kitchen": false, "Garden": false, "Entrance": false }
  });

  // ── ML pipeline poller ───────────────────────────────────────────────────
  const {
    commandsPayload,
    commandHistory,
    setCommandHistory,
    overrides,
    setOverrides,
    modelStatus,
    deviceState,
    pollStats,
    isLoading
  } = useCommandsPoller(setDevices, humanLocksRef);

  const [simulationCommands, setSimulationCommands] = useState([]);
  // Fix 4.6: fetchRef prevents stale results from an earlier slow /api/simulate
  // call overwriting results from a newer faster call.
  const fetchRef = useRef(0);

  useEffect(() => {
    let canceled = false;
    const myRef = ++fetchRef.current;
    async function fetchSim() {
      const deltas = await generateSimulatedDeltas({
        month: simParams.month,
        season: simParams.season,
        location: weatherLocation,
        hour: Math.floor(simParams.hour ?? 8),
        occupancy: simParams.occupancy,
        roomOccupancy: simParams.roomOccupancy
      });
      // Guard: cancelled (unmount) OR a newer call already resolved
      if (canceled || fetchRef.current !== myRef) return;
      setSimulationCommands(simulatedDeltasToCommands(deltas, {
        month: simParams.month,
        season: simParams.season,
        location: weatherLocation,
        hour: Math.floor(simParams.hour ?? 8),
        occupancy: simParams.occupancy,
        roomOccupancy: simParams.roomOccupancy
      }));
    }
    fetchSim();
    return () => { canceled = true; };
  }, [simParams, weatherLocation]);

  useEffect(() => {
    if (!simulationCommands.length) return;

    setDevices(current => {
      // Deep comparison: check if any simulation command actually changes a device's current state
      let changed = false;
      for (const cmd of simulationCommands) {
        if (!cmd.is_valid || cmd.suppressed || cmd.no_model) continue;
        const device = current[cmd.device_id];
        if (device && device.params[cmd.parameter] !== cmd.validated_value) {
          changed = true;
          break;
        }
      }

      // If no values actually changed, return the exact same reference to prevent re-renders
      if (!changed) return current;

      const appliedAt = new Date().toISOString();
      // Safe to call setCommandHistory here because we only enter this block when state actually changes
      setCommandHistory(prev => appendToHistory(prev, simulationCommands, appliedAt));
      
      const locks = humanLocksRef?.current ?? {};
      return applyCommandsWithPriority(current, simulationCommands, locks).nextDevices;
    });
  }, [simulationCommands, setCommandHistory]);

  // ── Human override handler ───────────────────────────────────────────────
  // LR-2 FIX: changeDevice uses a ref snapshot instead of closing over `devices`.
  // The old deps=[devices, setOverrides] caused changeDevice to recreate on every
  // device state update, triggering downstream re-renders of every consumer.
  const devicesRef = useRef(devices);
  useEffect(() => { devicesRef.current = devices; }, [devices]);

  const changeDevice = useCallback((deviceId, parameter, value) => {
    const device = devicesRef.current[deviceId];
    if (!device) return;
    const oldValue = device.params[parameter];
    if (oldValue === value) return;

    // 1. Optimistic UI update
    setDevices(current => ({
      ...current,
      [deviceId]: {
        ...current[deviceId],
        status: "Overridden by User",
        params: { ...current[deviceId].params, [parameter]: value },
        lastHumanActionAt: new Date().toISOString()
      }
    }));

    // 2. Lock this parameter from automation for 5 minutes
    humanLocksRef.current = recordHumanAction(
      pruneExpiredLocks(humanLocksRef.current),
      deviceId,
      parameter
    );

    // 3. Build and persist override event
    const event = buildOverrideEvent(device, parameter, oldValue, value);
    setOverrides(prev => [event, ...prev]);
    persistOverride(event); // async, non-blocking
  }, [setOverrides]);  // LR-2: stable — no longer recreates on every device state change

  // ── Derived values ───────────────────────────────────────────────────────
  const [lastSeenDeviceId, setLastSeenDeviceId] = useState("LivingRoom_LED_1");

  useEffect(() => {
    if (selectedDeviceId) {
      setLastSeenDeviceId(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  const selectedDevice = devices[selectedDeviceId ?? lastSeenDeviceId];
  const weather = weatherByLocation[weatherLocation];

  // Three-state summary for the selected device
  const selectedDeviceSummary = selectedDevice
    ? deviceStateSummary(selectedDevice, overrides)
    : null;

  // Per-device command history for the selected device
  const selectedDeviceHistory = selectedDevice
    ? getDeviceHistory(commandHistory, selectedDevice.id)
    : [];

  // Overrides filtered to the selected device
  const selectedDeviceOverrides = selectedDevice
    ? overridesForDevice(overrides, selectedDevice.id)
    : [];

  return (
    <HomeContext.Provider value={{
      // Navigation
      section, setSection,
      activeRoom, setActiveRoom,
      selectedDeviceId, setSelectedDeviceId,
      demoMode, setDemoMode,

      // Devices
      devices, setDevices,
      selectedDevice,
      selectedDeviceSummary,
      selectedDeviceHistory,
      selectedDeviceOverrides,
      changeDevice,

      // ML pipeline
      commandsPayload,
      commandHistory,
      simulationCommands,
      overrides,
      modelStatus,
      deviceState,
      pollStats,
      isLoading,

      // Weather
      weather, weatherLocation, setWeatherLocation,

      // Simulation params
      simParams, setSimParams
    }}>
      {children}
    </HomeContext.Provider>
  );
}

export function useHome() {
  const ctx = useContext(HomeContext);
  if (!ctx) throw new Error("useHome must be used inside HomeProvider");
  return ctx;
}
