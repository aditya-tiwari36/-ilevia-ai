import { useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { confidenceDistribution, computeBatchStats } from "../../services/CommandService.js";
import { formatLatency } from "../../lib/smartHome.js";
import { useHome } from "../../context/HomeContext.jsx";

function MetricCard({ label, value, sub, accent }) {
  return (
    <motion.div
      className="rounded-3xl border border-white/14 bg-white/10 p-5 backdrop-blur"
      whileHover={{ backgroundColor: "rgba(255,255,255,0.14)" }}
      transition={{ duration: 0.2 }}
    >
      <p className="text-xs text-white/50">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-white/35">{sub}</p>}
    </motion.div>
  );
}

const ConfTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/20 bg-[#0d2230]/90 px-3 py-2 text-xs text-white backdrop-blur">
      <p className="text-white/60">{label}</p>
      <p className="text-[#57cabe] font-semibold">{payload[0]?.value} commands</p>
    </div>
  );
};

export function PerformanceTab({ commands, overrides }) {
  const { pollStats } = useHome();

  const stats = useMemo(() => computeBatchStats(commands), [commands]);
  const distribution = useMemo(() => confidenceDistribution(commands), [commands]);

  const suppressionRate = stats.total ? `${Math.round((stats.suppressed / stats.total) * 100)}%` : "0%";
  const noModelRate    = stats.total ? `${Math.round((stats.noModel  / stats.total) * 100)}%` : "0%";
  const executionRate  = stats.total ? `${Math.round((stats.executed / stats.total) * 100)}%` : "0%";
  const overrideRate   = (stats.total + overrides.length)
    ? `${Math.round((overrides.length / (stats.total + overrides.length)) * 100)}%`
    : "0%";

  const avgConf = stats.avgConfidence != null
    ? `${(stats.avgConfidence * 100).toFixed(1)}%`
    : "regression";

  const metrics = [
    { label: "Poll Interval",         value: "5 s",                    sub: "live sync interval",            accent: "text-[#57cabe]" },
    { label: "Last Poll Latency",     value: formatLatency(pollStats.latencyMs), sub: "fetch + apply time"  },
    { label: "Data Source",           value: pollStats.source === "api" ? "Live API" : pollStats.source === "fallback" ? "Fallback JSON" : "—",
                                      sub: "commands.json origin",
                                      accent: pollStats.source === "api" ? "text-emerald-400" : "text-amber-400" },
    { label: "Poll Count",            value: pollStats.count,           sub: "since page load"                },
    { label: "Commands (batch)",      value: stats.total,               sub: "current commands.json"          },
    { label: "Executed",              value: stats.executed,            sub: `${executionRate} of batch`,     accent: "text-emerald-400" },
    { label: "Suppressed",            value: stats.suppressed,          sub: `${suppressionRate} confidence < threshold`, accent: "text-amber-400" },
    { label: "No Model",              value: stats.noModel,             sub: `${noModelRate} untrained`,      accent: "text-slate-400" },
    { label: "Held",                  value: stats.held,                sub: "invalid / schema fail"          },
    { label: "Avg Confidence",        value: avgConf,                   sub: "across batch"                   },
    { label: "Suppression Rate",      value: suppressionRate,           sub: "of current batch"               },
    { label: "Override Rate",         value: overrideRate,              sub: "human vs automation"            },
    { label: "Human Overrides",       value: overrides.length,          sub: "total written to file"          },
  ];

  const hasDistribution = distribution.some(b => b.count > 0);

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-4">
        {metrics.map(m => (
          <MetricCard key={m.label} label={m.label} value={m.value} sub={m.sub} accent={m.accent} />
        ))}
      </div>

      {/* Confidence distribution chart */}
      {hasDistribution && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/40">
            Prediction Confidence Distribution
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={distribution} margin={{ top: 4, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,.1)" strokeDasharray="3 3" />
              <XAxis dataKey="range" stroke="rgba(255,255,255,.4)" tick={{ fontSize: 10 }} />
              <YAxis stroke="rgba(255,255,255,.4)" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<ConfTooltip />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={28}>
                {distribution.map((d, i) => {
                  const pct = i / 9;
                  const color = pct < 0.5
                    ? `hsl(${Math.round(pct * 40)}, 80%, 55%)`      // red → amber
                    : `hsl(${Math.round(140 + pct * 40)}, 65%, 55%)`; // teal → green
                  return <Cell key={i} fill={color} opacity={d.count ? 0.85 : 0.2} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!hasDistribution && (
        <div className="rounded-2xl border border-white/10 bg-white/8 p-6 text-center text-sm text-white/40">
          Confidence distribution will appear once the ML pipeline sends commands with confidence scores.
        </div>
      )}
    </div>
  );
}
