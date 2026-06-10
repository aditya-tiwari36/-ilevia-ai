import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { weatherByLocation } from "../../data/home.js";
import { statusFor } from "../../lib/smartHome.js";
import { GlassShell } from "../shared/GlassShell.jsx";
import { StatusPill } from "../shared/StatusPill.jsx";
import { useHome } from "../../context/HomeContext.jsx";
import { ChevronDown, Play, Square, RotateCcw, Zap } from "lucide-react";

const COMPRESSIONS = [60, 120, 300, 480];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SEASONS = ["Summer","Monsoon","Autumn","Winter"];
const LOCATIONS = Object.keys(weatherByLocation);

/**
 * Bug 3 FIX — Simulation dropdowns
 *
 * Old: <select className="bg-white/14 text-white"> — the translucent white
 * background on a dark glass panel produced very low contrast. On some OS/
 * browser combos the dropdown list itself used the system theme which
 * ignored the CSS entirely.
 *
 * Fix: use the new .glass-select CSS class (defined in styles.css) which
 * forces a near-opaque dark background so text is always visible, and
 * sets explicit dark-bg on <option> elements for the dropdown list.
 */
function GlassSelect({ label, value, onChange, options, suffix = "" }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.2em] text-white/70">
        {label}
      </span>
      <div className="relative">
        {/* Bug 3 FIX: use .glass-select instead of Tailwind classes that
            produced near-invisible text on the translucent glass background */}
        <select
          value={value}
          onChange={e => onChange(isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}
          className="glass-select"
        >
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}{suffix ? ` ${suffix}` : ""}</option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#57cabe]"
          size={16}
        />
      </div>
    </label>
  );
}

function OccupancyButton({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`rounded-2xl px-3 py-2.5 text-xs font-semibold backdrop-blur transition-all duration-200 ${
        active ? "bg-[#57cabe] text-[#0a1a22] shadow-lg shadow-[#57cabe]/30" : "bg-white/14 text-white/90 border border-white/20 hover:bg-white/24"
      }`}>
      {label}
    </button>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/20 bg-[#0d2230]/90 px-3 py-2 text-xs text-white backdrop-blur">
      <p className="font-semibold mb-1">Command #{label}</p>
      <p className="text-[#57cabe]">Confidence: {payload[0]?.value}%</p>
    </div>
  );
};

export function SimulationSection() {
  const { weatherLocation, setWeatherLocation, commandsPayload, simParams, setSimParams,
          simulationCommands, pollStats } = useHome();

  // P1-4: Detect ML server offline — simDeltas empty after ≥1 poller tick
  const pyLikelyOffline = pollStats.count > 1 && simulationCommands.length === 0;

  // Clock state — local to simulation
  const [clock, setClock] = useState(8);
  const [running, setRunning] = useState(true);

  // Derived from shared simParams
  const { month, season, compression, occupancy, roomOccupancy } = simParams;

  const updateSimParam = useCallback((key, value) => {
    setSimParams(prev => ({ ...prev, [key]: value }));
  }, [setSimParams]);

  const updateOccupancy = useCallback((key) => {
    setSimParams(prev => ({ ...prev, occupancy: { ...prev.occupancy, [key]: !prev.occupancy[key] } }));
  }, [setSimParams]);

  const updateRoomOccupancy = useCallback((room) => {
    setSimParams(prev => ({ ...prev, roomOccupancy: { ...prev.roomOccupancy, [room]: !prev.roomOccupancy[room] } }));
  }, [setSimParams]);

  const commands = commandsPayload.commands ?? [];
  const weather = weatherByLocation[weatherLocation];

  // Advance clock
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setClock(c => (c + 24 / compression) % 24), 1000);
    return () => window.clearInterval(id);
  }, [compression, running]);

  useEffect(() => {
    setSimParams(prev => ({ ...prev, hour: clock }));
  }, [clock, setSimParams]);

  // Confidence timeline from real commands
  const timeline = useMemo(() =>
    commands.slice(0, 20).map((cmd, i) => ({
      name: String(i + 1),
      confidence: Math.round((cmd.confidence ?? 0.72) * 100)
    })), [commands]);

  // Fix 4.6: consume simulationCommands from context (no double API call)
  const simDeltas = useMemo(() => {
    if (!simulationCommands?.length) return [];
    return simulationCommands
      .filter(c => c.is_valid && !c.suppressed && !c.no_model)
      .map(c => ({
        device_id: c.device_id,
        parameter: c.parameter,
        simulated_value: c.validated_value,
        reason: c.reason ?? c.schema_msg ?? "Simulation output",
        confidence: c.confidence ?? 0.7
      }));
  }, [simulationCommands]);

  const hh = String(Math.floor(clock)).padStart(2, "0");
  const mm = String(Math.floor((clock % 1) * 60)).padStart(2, "0");

  return (
    <GlassShell title="Simulation" kicker="AI System Testbed">
      {/* Bug 3 FIX: grid is now min-h-0 so inner panels can scroll without
          the page overflowing. Controls column is slightly wider to
          accommodate the readable dark dropdowns. */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        {/* Controls */}
        <section className="glass-panel space-y-5 overflow-y-auto lg:max-h-[calc(100vh-140px)]">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/60">Simulation Controls</p>

          <GlassSelect label="Time Compression" value={compression} onChange={v => updateSimParam("compression", v)} options={COMPRESSIONS} suffix="sec/day" />
          <GlassSelect label="Month" value={month} onChange={v => updateSimParam("month", v)} options={MONTHS} />
          <GlassSelect label="Season" value={season} onChange={v => updateSimParam("season", v)} options={SEASONS} />
          <GlassSelect label="Location" value={weatherLocation} onChange={setWeatherLocation} options={LOCATIONS} />

          <div className="flex gap-2">
            <button onClick={() => setRunning(v => !v)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition ${
                running ? "bg-[#57cabe] text-[#0a1a22]" : "bg-white/14 text-white hover:bg-white/24"
              }`}>
              {running ? <Square size={14} /> : <Play size={14} />}
              {running ? "Pause" : "Resume"}
            </button>
            <button onClick={() => setClock(8)} className="rounded-2xl bg-white/14 px-4 py-3 text-white hover:bg-white/24 border border-white/20" title="Reset clock to 08:00">
              <RotateCcw size={15} />
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-white/60">Occupancy State</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(occupancy).map(key => (
                <OccupancyButton key={key} label={key} active={occupancy[key]} onClick={() => updateOccupancy(key)} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-white/60">Room Presence</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.keys(roomOccupancy).map(room => (
                <OccupancyButton key={room} label={room} active={roomOccupancy[room]} onClick={() => updateRoomOccupancy(room)} />
              ))}
            </div>
          </div>
        </section>

        {/* Main panel */}
        <section className="glass-panel flex flex-col overflow-y-auto lg:max-h-[calc(100vh-140px)]">
          {/* Clock + weather */}
          <div className="mb-5 flex items-start justify-between gap-4 flex-shrink-0">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Accelerated Clock</p>
              <div className="mt-1 flex items-end gap-3">
                <motion.h2 className="text-3xl md:text-6xl font-semibold tabular-nums text-white"
                  key={`${hh}:${mm}`} initial={{ opacity: 0.7 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}>
                  {hh}:{mm}
                </motion.h2>
                <div className="mb-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${running ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
                    {running ? "Running" : "Paused"}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-white/50">{month} · {season} · {Math.round(24 / compression * 1000)}× speed</p>
            </div>
            <div className="rounded-3xl bg-white/12 border border-white/18 px-6 py-4 text-right text-white backdrop-blur flex-shrink-0">
              <p className="text-3xl font-semibold">{weather.temp}°C</p>
              <p className="text-sm text-white/70">{weather.condition}</p>
              <p className="text-xs text-white/45 mt-0.5">{weatherLocation}</p>
            </div>
          </div>

          {/* Confidence chart */}
          <div className="mb-5 flex-shrink-0">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50">Command Confidence Timeline</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={timeline} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#57cabe" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#57cabe" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.1)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,.4)" tick={{ fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,.4)" tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Area dataKey="confidence" stroke="#57cabe" strokeWidth={2.5} fill="url(#simGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Simulation Engine deltas */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50 flex items-center gap-1.5">
              <Zap size={12} className="text-[#f5c842]" />
              Simulation Engine Predictions ({simDeltas.length > 0 ? `${simDeltas.length} active` : "none"})
            </p>
            {/* P1-4: ML offline warning */}
            {pyLikelyOffline && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
                <span className="text-base leading-none">⚠</span>
                <span>
                  <strong>Python ML server offline</strong> — simulation predictions unavailable.
                  Ensure <code className="rounded bg-amber-500/20 px-1 text-[10px]">python smart_home_pipeline.py production</code> is running on port 5174.
                </span>
              </div>
            )}
            {simDeltas.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                <AnimatePresence>
                  {simDeltas.map((delta, i) => (
                    <motion.div key={`${delta.device_id}-${delta.parameter}`}
                      className="rounded-2xl border border-[#57cabe]/30 bg-[#57cabe]/10 p-3 backdrop-blur"
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.04 }}>
                      <p className="text-xs font-semibold text-white truncate">{delta.device_id}</p>
                      <p className="text-[10px] text-white/55 mt-0.5 truncate">{delta.parameter}</p>
                      <p className="text-xs text-[#57cabe] font-medium mt-1">→ {String(delta.simulated_value)}</p>
                      <p className="text-[9px] text-white/40 mt-1 line-clamp-2">{delta.reason}</p>
                      <p className="text-[9px] text-[#57cabe]/70 mt-1">{Math.round((delta.confidence ?? 0.7) * 100)}% conf</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-xs text-white/50">
                {Object.values(roomOccupancy).every(v => !v) && !occupancy.Occupancy
                  ? "No occupancy detected — all predictions suppressed"
                  : "Adjust month, season, or occupancy to generate simulation predictions."}
              </div>
            )}
          </div>

          {/* Real pipeline commands */}
          <div className="flex-1">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50">Pipeline Commands (live)</p>
            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
              {commands.slice(0, 9).map((cmd, i) => (
                <motion.div key={`${cmd.device_id}-${cmd.parameter}`}
                  className="rounded-2xl border border-white/14 bg-white/10 p-3 backdrop-blur"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <p className="text-xs font-semibold text-white truncate">{cmd.device_id}</p>
                  <p className="text-[10px] text-white/55 mt-0.5 truncate">{cmd.parameter?.replace(/_/g, " ")}</p>
                  <p className="text-xs text-[#57cabe] font-medium mt-1">
                    → {cmd.validated_value != null ? String(cmd.validated_value) : "held"}
                  </p>
                  <div className="mt-2">
                    <StatusPill status={
                      cmd.suppressed && cmd.no_model ? "Held" :
                      cmd.no_model ? "No Model" :
                      cmd.suppressed ? "Suppressed" :
                      cmd.is_valid ? "Executed" : "Held"
                    } compact />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </GlassShell>
  );
}
