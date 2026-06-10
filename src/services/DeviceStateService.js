/**
 * DeviceStateService
 *
 * Pure business-logic module — no React, no state.
 * Manages the "human wins" priority reconciliation.
 *
 * Core rule:
 *   If a user manually changed a device parameter within HUMAN_LOCK_MS,
 *   automation is NOT allowed to overwrite that parameter.
 *   This prevents the AI from instantly undoing a human decision.
 */

import { normalizeParamName, statusFor } from "../lib/smartHome.js";

// How long a human override locks a device parameter from automation (5 minutes)
const HUMAN_LOCK_MS = 5 * 60 * 1000;

/**
 * Check whether a device parameter is currently locked by a human override.
 * humanLocks: Map<deviceId, Map<parameter, lockedUntilMs>>
 */
export function isHumanLocked(humanLocks, deviceId, parameter) {
  const deviceLocks = humanLocks[deviceId];
  if (!deviceLocks) return false;
  const lockedUntil = deviceLocks[parameter];
  if (!lockedUntil) return false;
  return Date.now() < lockedUntil;
}

/** Record a human action — locks that parameter for HUMAN_LOCK_MS */
export function recordHumanAction(humanLocks, deviceId, parameter) {
  return {
    ...humanLocks,
    [deviceId]: {
      ...(humanLocks[deviceId] ?? {}),
      [parameter]: Date.now() + HUMAN_LOCK_MS
    }
  };
}

/** Remove expired locks */
export function pruneExpiredLocks(humanLocks) {
  const now = Date.now();
  const pruned = {};
  Object.entries(humanLocks).forEach(([deviceId, paramLocks]) => {
    const stillLocked = {};
    Object.entries(paramLocks).forEach(([param, until]) => {
      if (until > now) stillLocked[param] = until;
    });
    if (Object.keys(stillLocked).length) pruned[deviceId] = stillLocked;
  });
  return pruned;
}

/**
 * Apply a batch of ML commands to device state, respecting human locks.
 * Returns { nextDevices, skippedCount }
 */
export function applyCommandsWithPriority(currentDevices, commands, humanLocks) {
  const next = { ...currentDevices };
  let skippedCount = 0;

  commands.forEach(command => {
    const id = command.device_id;
    if (!next[id]) return;

    // Always record the lastAutomation (for reason panel display)
    // Even if we don't apply it, the device should know what AI tried to do
    const baseUpdate = { ...next[id], lastAutomation: command };

    // Not executable — update status only
    const executable = command.is_valid === true && command.suppressed === false && !command.no_model;
    if (!executable) {
      next[id] = { ...baseUpdate, status: statusFor(command) };
      return;
    }

    const parameterNorm = normalizeParamName(command.parameter);

    // Check human lock — if locked, skip applying this value but update lastAutomation
    if (isHumanLocked(humanLocks, id, parameterNorm)) {
      next[id] = { ...baseUpdate, status: "Overridden by User" };
      skippedCount++;
      return;
    }

    // Apply the command
    next[id] = {
      ...baseUpdate,
      status: "Executed",
      params: {
        ...next[id].params,
        [parameterNorm]: command.validated_value
      }
    };
  });

  return { nextDevices: next, skippedCount };
}

/** Build a three-state summary for a device: current, predicted, last human */
export function deviceStateSummary(device, overrides) {
  const latestOverride = overrides.find(o => o.device === device.id) ?? null;
  const predicted = device.lastAutomation ?? null;

  return {
    current: device.params,
    predicted: predicted
      ? {
          parameter: normalizeParamName(predicted.parameter),
          value: predicted.validated_value,
          confidence: predicted.confidence,
          timestamp: predicted.timestamp,
          status: statusFor(predicted),
          reason: predicted.reason
        }
      : null,
    lastHuman: latestOverride
      ? {
          parameter: latestOverride.parameter_changed,
          value: latestOverride.new_value,
          timestamp: latestOverride.timestamp
        }
      : null
  };
}
