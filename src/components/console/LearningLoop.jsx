import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, Cpu, UserCheck, FileText, Database, TrendingUp, ArrowRight } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useHome } from "../../context/HomeContext.jsx";
import { computeBatchStats } from "../../services/CommandService.js";
import { DemoScenarioButton } from "./DemoScenarioButton.jsx";

/* ── Pipeline step definitions ──────────────────────────────────────── */
const STEPS = [
  { Icon: BrainCircuit, title: "AI Prediction",            color: "#57cabe", bg: "rgba(87,202,190,0.15)",  desc: "ML model generates device commands from weather, occupancy, time, and user patterns." },
  { Icon: Cpu,          title: "Command Executed",          color: "#7a9de8", bg: "rgba(122,157,232,0.15)", desc: "Validated commands (is_valid=true, suppressed=false) applied to device state." },
  { Icon: UserCheck,    title: "User Override",             color: "#f5a623", bg: "rgba(245,166,35,0.15)",  desc: "Human adjusts a device. System locks that parameter from automation for 5 min." },
  { Icon: FileText,     title: "override_events.json",      color: "#e85c8a", bg: "rgba(232,92,138,0.15)",  desc: "Override event appended: device, room, parameter, old→new value, AI context." },
  { Icon: Database,     title: "Training Data Generated",   color: "#4aaf6e", bg: "rgba(74,175,110,0.15)",  desc: "Override becomes labeled training sample. Human corrections teach preferences." },
  { Icon: TrendingUp,   title: "Predictions Improved",      color: "#c882e8", bg: "rgba(200,130,232,0.15)", desc: "Model retrains on enriched data. Next cycle aligns better with user preferences." }
];

/* ── Confidence sparkline ───────────────────────────────────────────── */
function ConfidenceSparkline({ commands }) {
  const data = commands.slice(0, 20).map((cmd, i) => ({
    name: String(i + 1),
    conf: cmd.confidence != null ? Math.round(cmd.confidence * 100) : null
  })).filter(d => d.conf != null);

  if (data.length === 0) return null;

  return (
    <div className="rounded-3xl border border-white/14 bg-white/8 p-4 backdrop-blur">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/40">
        Prediction Confidence Trend (this batch)
      </p>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#57cabe" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#57cabe" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" stroke="rgba(255,255,255,.3)" tick={{ fontSize: 10 }} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-lg bg-[#0d2230]/90 px-2 py-1 text-xs text-white">
                  {payload[0].value}% confidence
                </div>
              ) : null
            }
          />
          <Area dataKey="conf" stroke="#57cabe" strokeWidth={2} fill="url(#confGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Live step indicator ────────────────────────────────────────────── */
function StepCard({ Icon, title, desc, color, bg, stepNum, active, count }) {
  return (
    <div className="flex flex-1 items-stretch gap-2.5">
      <motion.div
        className="flex flex-1 flex-col rounded-3xl border p-4 backdrop-blur"
        style={{
          backgroundColor: active ? bg.replace("0.15", "0.28") : bg,
          borderColor: active ? `${color}55` : "rgba(255,255,255,0.14)"
        }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: stepNum * 0.07 }}
        whileHover={{ scale: 1.02 }}
      >
        {/* Icon */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}22` }}>
            <Icon size={20} style={{ color }} />
          </div>
          {active && (
            <motion.div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
        </div>

        <p className="mb-1.5 text-xs font-bold text-white leading-tight">{title}</p>
        <p className="text-[10px] leading-relaxed text-white/50 flex-1">{desc}</p>

        {/* Count badge + step indicator */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <motion.div className="h-1.5 w-6 rounded-full" style={{ backgroundColor: color }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, delay: stepNum * 0.3 }} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>Step {stepNum + 1}</span>
          </div>
          {count != null && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${color}22`, color }}>
              {count}
            </span>
          )}
        </div>
      </motion.div>

      {stepNum < STEPS.length - 1 && (
        <div className="flex flex-col items-center justify-center">
          <motion.div animate={{ x: [0, 4, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: stepNum * 0.2 }}>
            <ArrowRight size={18} className="text-white/25" />
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export function LearningLoop({ overrides }) {
  const { commandsPayload, pollStats, devices, commandHistory, modelStatus } = useHome();
  const commands = commandsPayload.commands ?? [];
  const [deviceId, setDeviceId] = useState("");
  const selectedId = deviceId || Object.keys(devices)[0];
  const device = devices[selectedId];
  const deviceCommands = commandHistory[selectedId] ?? [];

  // P0-2: Force Retrain button state
  const [retrainState, setRetrainState] = useState("idle"); // idle | loading | success | error
  async function handleForceRetrain() {
    setRetrainState("loading");
    try {
      const res = await fetch("/api/force-retrain", { method: "POST" });
      setRetrainState(res.ok ? "success" : "error");
    } catch {
      setRetrainState("error");
    }
    setTimeout(() => setRetrainState("idle"), 3500);
  }
  const deviceOverrides = overrides.filter(ev => ev.device === selectedId);
  const stats = useMemo(() => computeBatchStats(commands), [commands]);

  // Determine which steps are "active" based on live data
  // Fix 3.4: Step 6 now gates on last_retraining_time from the Python server
  // (was: overrides.length > 0 && pollStats.count > 1 — a false positive).
  const retrainConfirmed = !!modelStatus?.last_retraining_time;
  const stepActive = [
    pollStats.count > 0,                          // Step 1: predictions received
    stats.executed > 0,                           // Step 2: commands executed
    overrides.length > 0,                         // Step 3: user override happened
    overrides.length > 0,                         // Step 4: file written
    overrides.length > 0,                         // Step 5: training data exists
    retrainConfirmed && overrides.length > 0      // Step 6: server confirmed retrain
  ];

  const stepCounts = [
    stats.total,
    stats.executed,
    overrides.length,
    overrides.length,
    overrides.length,
    null
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <p className="text-sm text-white/50">The continuous learning cycle that makes Ilevia AI smarter over time</p>
        <div className="mt-4 max-w-md mx-auto">
          <DemoScenarioButton />
        </div>
        {overrides.length > 0 && (
          <motion.div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#57cabe]/20 px-4 py-1.5 text-xs font-semibold text-[#57cabe]"
            animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#57cabe]" />
            {overrides.length} override{overrides.length !== 1 ? "s" : ""} in training pipeline
          </motion.div>
        )}
      </div>

      {/* Steps */}
      <div className="flex items-stretch gap-2">
        {STEPS.map((step, i) => (
          <StepCard
            key={step.title}
            {...step}
            stepNum={i}
            active={stepActive[i]}
            count={stepCounts[i]}
          />
        ))}
      </div>

      {/* Confidence sparkline */}
      <ConfidenceSparkline commands={commands} />

      <div className="rounded-3xl border border-white/14 bg-white/8 p-4 backdrop-blur">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Device Learning History</p>
          <select
            value={selectedId}
            onChange={e => setDeviceId(e.target.value)}
            className="rounded-full border border-white/15 bg-white/12 px-3 py-2 text-xs font-semibold text-white outline-none"
          >
            {Object.values(devices).map(item => (
              <option key={item.id} value={item.id} className="bg-[#1a2e38] text-white">{item.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white/8 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Latest Prediction</p>
            <p className="mt-2 text-sm font-semibold text-white">{deviceCommands[0]?.parameter ?? "No prediction"}</p>
            <p className="text-xs text-[#57cabe]">{String(deviceCommands[0]?.validated_value ?? "waiting")}</p>
          </div>
          <div className="rounded-2xl bg-white/8 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Latest Override</p>
            <p className="mt-2 text-sm font-semibold text-white">{deviceOverrides[0]?.parameter_changed ?? "No override"}</p>
            <p className="text-xs text-amber-300">{String(deviceOverrides[0]?.new_value ?? "none")}</p>
          </div>
          <div className="rounded-2xl bg-white/8 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Retraining Candidate</p>
            <p className="mt-2 text-sm font-semibold text-white">{deviceOverrides.length ? "Ready" : "Waiting"}</p>
            <p className="text-xs text-white/45">{deviceOverrides.length} stored event{deviceOverrides.length === 1 ? "" : "s"}</p>
          </div>
          <div className="rounded-2xl bg-[#57cabe]/10 border border-[#57cabe]/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#57cabe]">Model Status</p>
            <p className="mt-2 text-sm font-semibold text-white">{modelStatus?.training_dataset_size ?? 0} Samples</p>
            <p className="text-[10px] text-white/45 mt-1">{modelStatus?.last_retraining_time ? `Retrained: ${new Date(modelStatus.last_retraining_time).toLocaleTimeString()}` : "No retrains yet"}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="max-h-44 overflow-y-auto rounded-2xl bg-white/6 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Prediction / Execution</p>
            {deviceCommands.slice(0, 6).map((cmd, i) => (
              <p key={`${cmd.timestamp}-${i}`} className="mb-1 text-xs text-white/65">
                {cmd.parameter} {"->"} {String(cmd.validated_value ?? "held")} · {cmd.suppressed ? "suppressed" : cmd.no_model ? "no model" : "executed"}
              </p>
            ))}
          </div>
          <div className="max-h-44 overflow-y-auto rounded-2xl bg-white/6 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Stored Events / Improvement</p>
            {deviceOverrides.slice(0, 6).map((ev, i) => (
              <p key={`${ev.timestamp}-${i}`} className="mb-1 text-xs text-white/65">
                {ev.parameter_changed}: {String(ev.old_value)} {"->"} {String(ev.new_value)} feeds next training pass
              </p>
            ))}
            {!deviceOverrides.length && <p className="text-xs text-white/35">Manual changes will appear here as learning samples.</p>}
          </div>
        </div>
      </div>

      {/* Live training events feed */}
      {overrides.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/40">Live Training Events Feed</p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {overrides.slice(0, 10).map((ev, i) => (
              <motion.div
                key={`${ev.timestamp}-${i}`}
                className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-white">{ev.device_name ?? ev.device}</span>
                  <span className="text-white/30">·</span>
                  <span className="text-white/60">{ev.parameter_changed}</span>
                  <ArrowRight size={11} className="text-[#57cabe]" />
                  <span className="font-semibold text-[#57cabe]">{String(ev.new_value)}</span>
                  <span className="ml-auto text-white/30 flex-shrink-0">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  {ev.previous_automation && (
                    <span className="flex-shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                      OVERRIDE
                    </span>
                  )}
                </div>
                {ev.previous_automation && (
                  <p className="mt-1 text-[10px] text-white/35">
                    AI had predicted: {String(ev.previous_automation.predicted_value)} ({Math.round((ev.previous_automation.confidence ?? 0) * 100)}% confidence)
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* P0-2: Force Retrain button — bypasses the 1-hour retrain timer so
          the learning loop can close in a demo. Endpoint exists in Vite +
          Python; this was the only missing UI trigger. */}
      <div className="flex items-center justify-between rounded-3xl border border-white/14 bg-white/8 px-5 py-4 backdrop-blur">
        <div>
          <p className="text-xs font-bold text-white">Force Retrain</p>
          <p className="text-[10px] text-white/40 mt-0.5">
            Bypasses the hourly timer — ingests all pending overrides immediately.
            {modelStatus?.last_retraining_time
              ? ` Last: ${new Date(modelStatus.last_retraining_time).toLocaleTimeString()}`
              : " No retrains yet."}
          </p>
        </div>
        <button
          id="force-retrain-btn"
          onClick={handleForceRetrain}
          disabled={retrainState === "loading"}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
            retrainState === "loading"  ? "bg-white/10 text-white/40 cursor-wait" :
            retrainState === "success"  ? "bg-[#4aaf6e]/30 text-[#4aaf6e] border border-[#4aaf6e]/40" :
            retrainState === "error"    ? "bg-red-500/20 text-red-400 border border-red-500/30" :
            "bg-[#57cabe]/20 text-[#57cabe] border border-[#57cabe]/30 hover:bg-[#57cabe]/30"
          }`}
        >
          <TrendingUp size={13} />
          {retrainState === "loading" ? "Retraining…" :
           retrainState === "success" ? "✓ Triggered" :
           retrainState === "error"   ? "⚠ ML Offline" :
           "Force Retrain"}
        </button>
      </div>
    </div>
  );
}
