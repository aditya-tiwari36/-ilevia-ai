/**
 * CommandService
 *
 * Pure business-logic module — no React, no state.
 * Maintains per-device command history and computes analytics.
 *
 * History entry shape:
 * {
 *   device_id, device_type, parameter, validated_value,
 *   confidence, is_valid, suppressed, no_model, reason,
 *   timestamp, status, appliedAt
 * }
 */

const MAX_HISTORY_PER_DEVICE = 60;

/** Merge a new batch of commands into the existing history map */
export function appendToHistory(existingHistory, newCommands, appliedAt = new Date().toISOString()) {
  const next = { ...existingHistory };
  newCommands.forEach(cmd => {
    const id = cmd.device_id;
    if (!id) return;
    const entry = { ...cmd, appliedAt };
    const prev = next[id] ?? [];
    // Deduplicate by timestamp+parameter — don't double-add same batch
    const isDupe = prev.some(p => p.timestamp === cmd.timestamp && p.parameter === cmd.parameter);
    if (isDupe) return;
    next[id] = [entry, ...prev].slice(0, MAX_HISTORY_PER_DEVICE);
  });
  return next;
}

/** Get history for a single device, newest first */
export function getDeviceHistory(history, deviceId) {
  return history[deviceId] ?? [];
}

/** Compute summary stats across all commands in the current batch */
export function computeBatchStats(commands) {
  const total = commands.length;
  if (total === 0) return { total: 0, executed: 0, suppressed: 0, noModel: 0, held: 0, avgConfidence: null };

  const executed = commands.filter(c => c.is_valid && !c.suppressed && !c.no_model).length;
  const suppressed = commands.filter(c => c.suppressed && !c.no_model).length;
  const noModel = commands.filter(c => c.no_model).length;
  const held = total - executed - suppressed - noModel;

  const withConfidence = commands.filter(c => typeof c.confidence === "number");
  const avgConfidence = withConfidence.length
    ? withConfidence.reduce((s, c) => s + c.confidence, 0) / withConfidence.length
    : null;

  return { total, executed, suppressed, noModel, held, avgConfidence };
}

/** Build chart data series from command history for a single device */
export function buildChartData(deviceHistory, overrideHistory, parameterName) {
  if (!deviceHistory.length) return [];

  // Group into 2-hour buckets over last 24 hours
  const now = Date.now();
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const bucketStart = now - (12 - i) * 2 * 3600_000;
    const bucketEnd = bucketStart + 2 * 3600_000;
    const label = new Date(bucketStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Find last command for this parameter in this bucket
    const cmd = deviceHistory.find(h => {
      const t = new Date(h.timestamp).getTime();
      return t >= bucketStart && t < bucketEnd &&
        (h.parameter === parameterName || !parameterName);
    });

    // Find override in this bucket
    const override = overrideHistory.find(o => {
      const t = new Date(o.timestamp).getTime();
      return t >= bucketStart && t < bucketEnd &&
        (!parameterName || o.parameter_changed === parameterName);
    });

    return {
      time: label,
      ai: cmd?.validated_value != null ? Number(cmd.validated_value) || 0 : null,
      override: override?.new_value != null ? Number(override.new_value) || 0 : null,
      confidence: cmd?.confidence != null ? Math.round(cmd.confidence * 100) : null,
    };
  });

  return buckets;
}

/** Confidence distribution — group confidences into 10% buckets */
export function confidenceDistribution(commands) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}–${i * 10 + 10}%`,
    count: 0
  }));
  commands.forEach(cmd => {
    if (typeof cmd.confidence !== "number") return;
    const idx = Math.min(9, Math.floor(cmd.confidence * 10));
    buckets[idx].count++;
  });
  return buckets;
}
