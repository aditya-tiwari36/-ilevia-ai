import { AnimatePresence, motion } from "framer-motion";
import { deviceCopy } from "../../data/home.js";
import { deviceActive, displayValue, formatLatency, normalizeParamName, primaryParameter, statusFor } from "../../lib/smartHome.js";
import { StatusPill } from "../shared/StatusPill.jsx";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Clock, Thermometer, Droplets, Wind } from "lucide-react";
import { useState } from "react";

/* ── Sub-components ──────────────────────────────────────────────────── */

function ControlRow({ device, parameter, value, changeDevice }) {
  const isNumber = typeof value === "number";
  const toggleParams = ["Power State", "Switch State", "Playback State", "Privacy Mode", "Zone 1 State", "Operation Mode"];
  const isToggle = toggleParams.includes(parameter);

  const onValues  = { "Zone 1 State": "Watering", "Playback State": "Playing", "Operation Mode": "Cool", "Privacy Mode": "On" };
  const offValues = { "Zone 1 State": "Idle",     "Playback State": "Paused",  "Operation Mode": "Off",  "Privacy Mode": "Off" };
  const onVal  = onValues[parameter]  ?? "On";
  const offVal = offValues[parameter] ?? "Off";
  const isOn = ["On", "Cool", "Watering", "Playing"].includes(value);

  // Fix 4.5: Use exact parameter name to distinguish AC Target Temperature (max 30°C)
  // from Color Temperature (max 6500K). The old `.includes("Temperature")` substring
  // match caused Color Temperature sliders to be capped at 30 — dormant but dangerous.
  const maxVal = parameter === "Target Temperature" ? 30
               : parameter === "Color Temperature"  ? 6500
               : 100;
  const selectOptions = { "Fan Speed": ["Low","Medium","High"], "Color Temperature": ["Warm","Neutral","Cool"] };

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-white">{parameter}</span>
        <span className="text-xs font-medium text-[#9ab0a8]">{displayValue(value)}</span>
      </div>
      {isNumber ? (
        <input type="range" min="0" max={maxVal} value={value}
          onChange={e => changeDevice(device.id, parameter, Number(e.target.value))}
          className="w-full accent-[#57cabe]" />
      ) : isToggle ? (
        <button className={`toggle-btn ${isOn ? "on" : ""}`}
          onClick={() => changeDevice(device.id, parameter, isOn ? offVal : onVal)}>
          <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} />
        </button>
      ) : selectOptions[parameter] ? (
        <select value={value}
          onChange={e => changeDevice(device.id, parameter, e.target.value)}
          className="w-full rounded-lg border border-white/20 bg-[#0a1614] px-2.5 py-1.5 text-xs text-white">
          {selectOptions[parameter].map(opt => <option key={opt}>{opt}</option>)}
        </select>
      ) : (
        <span className="text-xs text-[#9ab0a8]">{displayValue(value)}</span>
      )}
    </div>
  );
}

function MetricRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
      <span className="text-[11px] text-[#9ab0a8]">{label}</span>
      <span className={`text-[11px] font-semibold ${accent ?? "text-white"}`}>{value}</span>
    </div>
  );
}

function Collapsible({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button className="mb-2 flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-white/50"
        onClick={() => setOpen(v => !v)}>
        {title}
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── State reconciliation block ─────────────────────────────────────── */
function StateReconciliation({ summary, primaryParam }) {
  if (!summary) return null;
  const { predicted, lastHuman } = summary;
  const currentVal = summary.current[primaryParam];
  const predictedVal = predicted?.parameter === primaryParam ? predicted.value : null;
  const humanVal = lastHuman?.parameter === primaryParam ? lastHuman.value : null;
  const isConflict = predictedVal != null && humanVal != null && predictedVal !== humanVal;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">State Reconciliation</p>

      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg bg-white/10 p-2 shadow-sm">
          <p className="text-[9px] text-[#9ab0a8] mb-0.5">Current</p>
          <p className="text-xs font-bold text-white">{displayValue(currentVal)}</p>
        </div>
        <div className="rounded-lg bg-white/10 p-2 shadow-sm">
          <p className="text-[9px] text-[#9ab0a8] mb-0.5">AI Predicted</p>
          <p className={`text-xs font-bold ${predictedVal != null ? "text-[#57cabe]" : "text-white/30"}`}>
            {predictedVal != null ? displayValue(predictedVal) : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-white/10 p-2 shadow-sm">
          <p className="text-[9px] text-[#9ab0a8] mb-0.5">Last Human</p>
          <p className={`text-xs font-bold ${humanVal != null ? "text-amber-400" : "text-white/30"}`}>
            {humanVal != null ? displayValue(humanVal) : "—"}
          </p>
        </div>
      </div>

      {isConflict && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-1.5 text-[10px] text-amber-400">
          <AlertTriangle size={11} />
          <span>Human override locked — AI prediction not applied</span>
        </div>
      )}
      {!isConflict && predicted && (
        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 text-[10px] text-emerald-400">
          <CheckCircle size={11} />
          <span>Device in sync with AI prediction</span>
        </div>
      )}
    </div>
  );
}

/* ── Weather factors ────────────────────────────────────────────────── */
function WeatherFactors({ weather }) {
  if (!weather) return null;
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#57cabe] mb-2">Weather Inputs to Model</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex items-center gap-1.5">
          <Thermometer size={12} className="text-[#e07050]" />
          <div>
            <p className="text-[9px] text-[#9ab0a8]">Temp</p>
            <p className="text-xs font-semibold text-white">{weather.temp}°C</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets size={12} className="text-[#5098c8]" />
          <div>
            <p className="text-[9px] text-[#9ab0a8]">Humidity</p>
            <p className="text-xs font-semibold text-white">{weather.humidity}%</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Wind size={12} className="text-[#9ab0a8]" />
          <div>
            <p className="text-[9px] text-[#9ab0a8]">Wind</p>
            <p className="text-xs font-semibold text-white">{weather.wind} km/h</p>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[9px] text-white/50">
        {weather.daylight ? "Daylight" : "Night"} · {weather.condition}
      </p>
    </div>
  );
}

/* ── Command history ────────────────────────────────────────────────── */
function CommandHistoryLine({ entry }) {
  const status = statusFor(entry);
  const time = entry.appliedAt
    ? new Date(entry.appliedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2">
      <Clock size={10} className="flex-shrink-0 text-[#9ab0a8]" />
      <span className="flex-1 text-[10px] text-white truncate">
        {normalizeParamName(entry.parameter)} → {displayValue(entry.validated_value)}
      </span>
      <span className="text-[9px] text-[#9ab0a8] flex-shrink-0">{time}</span>
      <StatusPill status={status} compact />
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export function ReasonPanel({ device, changeDevice, generatedAt, summary, deviceHistory, deviceOverrides, weather }) {
  if (!device) return null;

  const params = Object.entries(device.params);
  const automation = device.lastAutomation;
  const confidence = automation?.confidence ?? (device.status === "Overridden by User" ? 0.88 : 0.72);
  const confidencePct = Math.round(confidence * 100);
  const isActive = deviceActive(device);
  const primParam = primaryParameter(device);

  const baseReason = deviceCopy[device.kind] ?? "AI-driven automation manages this device.";
  const suppressionReason = automation?.reason && automation.reason !== "OK"
    ? automation.reason
    : null;

  const isSuppressed = device.status === "Suppressed" || device.status === "Held" || device.status === "No Model";

  return (
    <section className="flex h-full max-h-[calc(100vh-40px)] min-h-0 flex-col overflow-hidden rounded-[22px] bg-[#0c1816]/82 border border-white/10 text-white shadow-xl backdrop-blur-xl">
      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">AI Reason Panel</p>
            <h2 className="mt-0.5 text-xl font-semibold text-white leading-tight truncate">{device.name}</h2>
            <p className="mt-0.5 text-xs text-[#9ab0a8]">{device.id}</p>
          </div>
          <StatusPill status={device.status} />
        </div>

        {/* Confidence bar */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">AI Confidence</span>
            <span className="text-xs font-bold text-white">{confidencePct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className={`h-full rounded-full ${isSuppressed ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-gradient-to-r from-[#35766f] to-[#57cabe]"}`}
              initial={{ width: 0 }}
              animate={{ width: `${confidencePct}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Suppression badge */}
        {suppressionReason && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[10px] text-amber-400">
            <AlertTriangle size={11} />
            <span>Suppressed: {suppressionReason}</span>
          </div>
        )}
        {device.status === "No Model" && (
          <div className="mt-2 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-[10px] text-white/70">
            No trained model for this device. Automation held.
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* AI Reasoning */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#57cabe] mb-1">AI Reasoning</p>
          <p className="text-xs leading-[1.7] text-white/80">{baseReason}</p>
        </div>

        {/* Three-state reconciliation */}
        <StateReconciliation summary={summary} primaryParam={primParam} />

        {/* Weather factors */}
        <WeatherFactors weather={weather} />

        {/* Device controls */}
        <Collapsible title="Controls">
          <div className="space-y-2">
            {params.map(([parameter, value]) => (
              <ControlRow key={parameter} device={device} parameter={parameter}
                value={value} changeDevice={changeDevice} />
            ))}
          </div>
        </Collapsible>

        {/* Execution metadata */}
        <Collapsible title="Prediction Metadata" defaultOpen={false}>
          <div className="space-y-1.5">
            <MetricRow label="Prediction Source" value={automation ? "ML Pipeline" : "Local State"} />
            <MetricRow label="Device State" value={isActive ? "Active" : "Idle"} />
            <MetricRow label="Execution Status" value={device.status}
              accent={device.status === "Executed" ? "text-emerald-400" : device.status === "Overridden by User" ? "text-amber-400" : "text-white/50"} />
            <MetricRow label="Batch Generated" value={generatedAt ? new Date(generatedAt).toLocaleTimeString() : "Waiting…"} />
            <MetricRow label="Prediction Timestamp" value={automation?.timestamp ? new Date(automation.timestamp).toLocaleTimeString() : "—"} />
            {automation?.confidence != null && (
              <MetricRow label="Raw Confidence" value={`${(automation.confidence * 100).toFixed(1)}%`} />
            )}
            <MetricRow label="Override Count (device)"
              value={deviceOverrides.length > 0 ? `${deviceOverrides.length} override${deviceOverrides.length !== 1 ? "s" : ""}` : "None"}
              accent={deviceOverrides.length > 0 ? "text-amber-400" : "text-white"} />
          </div>
        </Collapsible>

        {/* Command history for this device */}
        <Collapsible title={`Command History (${deviceHistory.length})`} defaultOpen={false}>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {deviceHistory.length > 0 ? (
              deviceHistory.slice(0, 20).map((entry, i) => (
                <CommandHistoryLine key={`${entry.timestamp}-${i}`} entry={entry} />
              ))
            ) : (
              <p className="text-xs text-white/40 italic py-2">No commands received for this device yet.</p>
            )}
          </div>
        </Collapsible>

        {/* Override history for this device */}
        <Collapsible title={`Recent Overrides (${deviceOverrides.length})`} defaultOpen={true}>
          <div className="space-y-1.5">
            {deviceOverrides.length > 0 ? (
              deviceOverrides.slice(0, 6).map((ev, i) => (
                <div key={`${ev.timestamp}-${i}`}
                  className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-semibold text-amber-400">{ev.parameter_changed}</span>
                    <span className="text-[9px] text-amber-500/80">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-amber-400/80">
                    <span>{displayValue(ev.old_value)}</span>
                    <span>→</span>
                    <span className="font-bold text-amber-400">{displayValue(ev.new_value)}</span>
                    {ev.previous_automation && (
                      <span className="ml-auto text-[9px] text-amber-500/80">
                        (AI had: {displayValue(ev.previous_automation.predicted_value)})
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-white/40 italic py-2">No manual overrides recorded for this device.</p>
            )}
          </div>
        </Collapsible>
      </div>
    </section>
  );
}
