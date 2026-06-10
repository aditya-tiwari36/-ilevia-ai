export function statusFor(command) {
  if (!command) return "Held";
  if (command.suppressed && command.no_model) return "Held";
  if (command.no_model) return "No Model";
  if (command.suppressed) return "Suppressed";
  if (command.is_valid) return "Executed";
  return "Held";
}

export function isExecutable(command) {
  return command?.is_valid === true &&
    command?.suppressed === false &&
    !command?.no_model;
}

export function deviceRoom(deviceId) {
  if (deviceId?.startsWith("Bedroom")) return "Master Bedroom";
  if (deviceId?.startsWith("Kitchen")) return "Kitchen";
  if (deviceId?.startsWith("Garden")) return "Garden";
  if (deviceId?.startsWith("FrontDoor") || deviceId?.startsWith("Entrance")) return "Entrance";
  return "Living Room";
}

export function normalizeParamName(parameter) {
  return parameter?.replaceAll("_", " ") ?? "";
}

export function buildInitialDevices(rooms) {
  const map = {};
  Object.entries(rooms).forEach(([room, config]) => {
    config.devices.forEach(device => {
      map[device.id] = {
        ...device,
        room,
        params: { ...device.params },
        lastAutomation: null,
        status: "Held",
        lastHumanActionAt: null  // per-device human action timestamp
      };
    });
  });
  return map;
}

/**
 * Original apply — used by fallback path only.
 * For live polling use applyCommandsWithPriority from DeviceStateService.
 */
export function applyCommandsToDevices(current, commands) {
  const next = { ...current };
  commands.forEach(command => {
    const id = command.device_id;
    if (!next[id]) return;
    if (!isExecutable(command)) {
      next[id] = { ...next[id], status: statusFor(command), lastAutomation: command };
      return;
    }
    const parameter = normalizeParamName(command.parameter);
    next[id] = {
      ...next[id],
      status: "Executed",
      lastAutomation: command,
      params: {
        ...next[id].params,
        [parameter]: command.validated_value
      }
    };
  });
  return next;
}

export function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Held";
  if (typeof value === "number") return Number.isInteger(value) ? value : value.toFixed(1);
  return value;
}

export function deviceActive(device) {
  const params = device?.params ?? {};
  // Fix 4.4: Privacy Mode "Off" = camera is operational (not in privacy mode).
  // Removed: inverted `!== "On"` logic and unreachable Brightness branch
  // (Power State "On" was already handled by the first clause).
  return ["On", "Cool", "Watering", "Playing"].includes(params["Power State"])
    || (params["Operation Mode"] && params["Operation Mode"] !== "Off")
    || params["Zone 1 State"] === "Watering"
    || params["Playback State"] === "Playing"
    || params["Privacy Mode"] === "Off"
    || params["Switch State"] === "On";
}

/**
 * Build chart data from REAL command history for a device.
 * Falls back to seeded mock data if no history exists.
 */
export function chartSeries(deviceId, deviceHistory = [], parameter = null) {
  // If we have real history, build from that
  if (deviceHistory.length > 0) {
    const now = Date.now();
    return Array.from({ length: 12 }, (_, i) => {
      const bucketStart = now - (12 - i) * 2 * 3600_000;
      const bucketEnd = bucketStart + 2 * 3600_000;
      const label = new Date(bucketStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const entry = deviceHistory.find(h => {
        const t = new Date(h.timestamp).getTime();
        const paramMatch = !parameter || normalizeParamName(h.parameter) === parameter;
        return t >= bucketStart && t < bucketEnd && paramMatch;
      });

      return {
        time: label,
        value: entry?.validated_value != null ? Number(entry.validated_value) || 0 : null,
        confidence: entry?.confidence != null ? Math.round(entry.confidence * 100) : null,
        status: entry ? statusFor(entry) : null
      };
    });
  }

  // Seeded fallback (no history yet)
  const seed = deviceId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Array.from({ length: 12 }, (_, index) => ({
    time: `${String(index * 2).padStart(2, "0")}:00`,
    value: Math.max(8, Math.round(30 + Math.sin(index / 1.6 + seed) * 18 + ((seed + index * 7) % 24))),
    confidence: null,
    status: null
  }));
}

/** Get the primary display parameter name for a device kind */
export function primaryParameter(device) {
  const kind = device?.kind;
  const paramMap = {
    ac:         "Target Temperature",
    light:      "Brightness",
    fan:        "Fan Speed",
    speaker:    "Volume Level",
    irrigation: "Zone 1 State",
    blinds:     "Blinds Position",
    camera:     "Privacy Mode",
    plug:       "Switch State"
  };
  return paramMap[kind] ?? Object.keys(device?.params ?? {})[0];
}

/** Format ms duration as human-readable string */
export function formatLatency(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
