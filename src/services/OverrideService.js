/**
 * OverrideService
 *
 * Pure business-logic module — no React, no state.
 * Builds override event objects and tracks per-device override frequency.
 */

import { statusFor } from "../lib/smartHome.js";

/**
 * Maps device.kind → schema Device_Type string.
 * Python's _run_learning_cycle() renames "device_type" → "Device_Type".
 * Without this, 23/24 override events had Device_Type = NaN (Fix 1.3).
 */
const KIND_TO_DEVICE_TYPE = {
  light:      "Smart LED Light",
  ac:         "Smart Air Conditioner",
  fan:        "Smart Fan",
  speaker:    "Smart Speaker",
  irrigation: "Smart Irrigation Controller",
  blinds:     "Smart Motorized Blinds",
  camera:     "Smart Security Camera",
  plug:       "Smart Plug",
};

/** Build a fully-formed override event for override_events.json */
export function buildOverrideEvent(device, parameter, oldValue, newValue) {
  return {
    timestamp: new Date().toISOString(),
    room: device.room,
    device: device.id,
    device_name: device.name,
    // Fix 1.3: include device_type (schema-matching string) so Python can
    // rename it to Device_Type. device_kind is kept for frontend use only.
    device_type: KIND_TO_DEVICE_TYPE[device.kind] ?? device.kind,
    device_kind: device.kind,
    parameter_changed: parameter,
    old_value: oldValue,
    new_value: newValue,
    Trigger_Source: "Human",
    previous_automation: device.lastAutomation
      ? {
          timestamp: device.lastAutomation.timestamp,
          parameter: device.lastAutomation.parameter,
          predicted_value: device.lastAutomation.validated_value,
          confidence: device.lastAutomation.confidence,
          status: statusFor(device.lastAutomation),
          reason: device.lastAutomation.reason,
          is_correction: true  // always true — human changed what AI set
        }
      : null
  };
}

/** Persist override event to the backend (Vite middleware → override_events.json) */
export async function persistOverride(event) {
  try {
    const res = await fetch("/api/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    return res.ok;
  } catch {
    return false; // fail silently — local state already updated optimistically
  }
}

/** Compute per-device override frequency from override array */
export function overrideFrequency(overrides) {
  const freq = {};
  overrides.forEach(ev => {
    freq[ev.device] = (freq[ev.device] ?? 0) + 1;
  });
  return freq;
}

/** Get overrides for a specific device, newest first */
export function overridesForDevice(overrides, deviceId) {
  return overrides.filter(ev => ev.device === deviceId);
}

/** Get the most recently overridden parameter for a device */
export function lastOverrideForDevice(overrides, deviceId) {
  return overridesForDevice(overrides, deviceId)[0] ?? null;
}
