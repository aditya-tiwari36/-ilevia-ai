import { useMemo, useState } from "react";
import {
  CartesianGrid, ComposedChart, Line, Bar,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ReferenceLine
} from "recharts";
import { chartSeries, displayValue, normalizeParamName, primaryParameter } from "../../lib/smartHome.js";
import { overridesForDevice } from "../../services/OverrideService.js";
import { getDeviceHistory } from "../../services/CommandService.js";
import { useHome } from "../../context/HomeContext.jsx";
import { ChevronDown, TrendingUp } from "lucide-react";

const DEVICE_CONFIG = {
  ac:         { label: "Target Temperature (°C)", color: "#7a9de8", barColor: "#e87a7a", param: "Target Temperature" },
  light:      { label: "Brightness (%)",           color: "#f5c842", barColor: "#e87a7a", param: "Brightness" },
  fan:        { label: "Fan Speed",                color: "#57cabe", barColor: "#e87a7a", param: "Fan Speed", discrete: true },
  speaker:    { label: "Volume Level",             color: "#c882e8", barColor: "#e87a7a", param: "Volume Level" },
  irrigation: { label: "Zone Activity",            color: "#4aaf6e", barColor: "#e87a7a", param: "Zone 1 State", discrete: true },
  blinds:     { label: "Blinds Position (%)",      color: "#e8a442", barColor: "#e87a7a", param: "Blinds Position" },
  camera:     { label: "Privacy Mode",             color: "#e85c5c", barColor: "#e87a7a", param: "Privacy Mode", discrete: true },
  plug:       { label: "Switch Activity",          color: "#82e8c8", barColor: "#e87a7a", param: "Switch State", discrete: true }
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/20 bg-[#0d2230]/90 px-3 py-2.5 text-xs text-white backdrop-blur space-y-1">
      <p className="font-semibold text-white/70">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-white/70">{p.name}:</span>
          <span className="font-semibold" style={{ color: p.color }}>
            {p.value != null ? displayValue(p.value) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
};

function StatChip({ label, value, color }) {
  return (
    <div className="rounded-2xl border border-white/14 bg-white/10 px-4 py-3">
      <p className="text-[10px] text-white/50 mb-0.5">{label}</p>
      <p className="text-lg font-semibold" style={{ color: color ?? "white" }}>{value}</p>
    </div>
  );
}

export function DeviceAnalytics({ devices }) {
  const { commandHistory, overrides } = useHome();
  const deviceList = Object.values(devices);
  const [deviceId, setDeviceId] = useState(deviceList[0]?.id ?? "");

  const device = devices[deviceId];
  const cfg = DEVICE_CONFIG[device?.kind] ?? { label: "Value", color: "#57cabe", param: null };

  // Build real chart data from history
  const deviceHistory = useMemo(() => getDeviceHistory(commandHistory, deviceId), [commandHistory, deviceId]);
  const deviceOverrides = useMemo(() => overridesForDevice(overrides, deviceId), [overrides, deviceId]);

  // chartSeries now returns real data when history exists
  const aiData = useMemo(() => chartSeries(deviceId, deviceHistory, cfg.param), [deviceId, deviceHistory, cfg.param]);

  // Merge override data into chart points
  const chartData = useMemo(() => {
    return aiData.map(point => {
      // Find override in same time bucket
      const overrideInBucket = deviceOverrides.find(o => {
        if (!cfg.param || o.parameter_changed !== cfg.param) return false;
        const t = new Date(o.timestamp);
        const pTime = point.time.split(":").map(Number);
        return t.getHours() === pTime[0] && Math.floor(t.getMinutes() / 30) === Math.floor(pTime[1] / 30);
      });
      return {
        ...point,
        override: overrideInBucket ? Number(overrideInBucket.new_value) || 0 : null
      };
    });
  }, [aiData, deviceOverrides, cfg.param]);

  // Stats
  const executedCount = deviceHistory.filter(h => h.is_valid && !h.suppressed).length;
  const suppressedCount = deviceHistory.filter(h => h.suppressed || h.no_model).length;
  const avgConf = deviceHistory.filter(h => h.confidence != null).length > 0
    ? (deviceHistory.reduce((s, h) => s + (h.confidence ?? 0), 0) / deviceHistory.length * 100).toFixed(0) + "%"
    : "—";

  const hasRealData = deviceHistory.length > 0;

  return (
    <div>
      {/* Device selector */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full md:w-auto">
          <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
            className="w-full md:w-auto appearance-none rounded-2xl border border-white/20 bg-white/14 px-5 py-3 pr-10 text-sm font-semibold text-white backdrop-blur focus:border-[#57cabe]/60 focus:outline-none">
            {deviceList.map(d => (
              <option key={d.id} value={d.id} className="bg-[#1a2e38]">{d.name} ({d.id})</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-white/50" size={16} />
        </div>
        {device && (
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
            <span className="text-white/70 capitalize">{device.kind}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/50">{device.room}</span>
          </div>
        )}
        {!hasRealData && (
          <div className="flex items-center gap-1.5 rounded-2xl bg-amber-500/15 px-3 py-2 text-xs text-amber-400">
            <TrendingUp size={12} />
            <span>Showing estimated data — awaiting pipeline history</span>
          </div>
        )}
      </div>

      {/* Stat chips */}
      {device && (
        <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <StatChip label="Commands Received" value={deviceHistory.length} color="white" />
          <StatChip label="Executed" value={executedCount} color="#57cabe" />
          <StatChip label="Suppressed / Held" value={suppressedCount} color="#f5a623" />
          <StatChip label="Avg Confidence" value={avgConf} color="#c882e8" />
        </div>
      )}

      {/* Chart */}
      {device && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">{cfg.label} — last 24h</p>
            <div className="flex items-center gap-3 text-xs text-white/50">
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm" style={{ backgroundColor: cfg.color }} />AI Prediction</span>
              {deviceOverrides.length > 0 && (
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Human Override</span>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,.1)" strokeDasharray="3 3" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,.4)" tick={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,.4)" tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="value" name="AI Prediction" stroke={cfg.color}
                strokeWidth={2.5} dot={{ r: 3.5, fill: cfg.color, strokeWidth: 0 }}
                activeDot={{ r: 6 }} connectNulls={false} />
              {deviceOverrides.length > 0 && (
                <Bar dataKey="override" name="Human Override" fill="#f5a623" opacity={0.7}
                  radius={[4, 4, 0, 0]} barSize={10} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent command detail */}
      {deviceHistory.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/40">Recent Commands</p>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {deviceHistory.slice(0, 8).map((h, i) => (
              <div key={i}
                className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-xs backdrop-blur">
                {/* Mobile stacked layout */}
                <div className="md:hidden space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80 font-medium">{normalizeParamName(h.parameter)}</span>
                    <span className={`font-semibold ${h.is_valid && !h.suppressed ? "text-emerald-400" : "text-amber-400"}`}>
                      {h.is_valid && !h.suppressed ? "Exec" : h.no_model ? "No Model" : h.suppressed ? "Supp" : "Held"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#57cabe]">→ {displayValue(h.validated_value)}</span>
                    <span className="text-white/40 ml-auto">{h.confidence != null ? `${Math.round(h.confidence * 100)}%` : "regression"}</span>
                  </div>
                </div>
                {/* Desktop grid layout */}
                <div className="hidden md:grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr] items-center gap-3">
                  <span className="text-white/80">{normalizeParamName(h.parameter)}</span>
                  <span className="font-semibold text-[#57cabe]">→ {displayValue(h.validated_value)}</span>
                  <span className="text-white/40">{h.confidence != null ? `${Math.round(h.confidence * 100)}%` : "regression"}</span>
                  <span className={`font-semibold text-right ${h.is_valid && !h.suppressed ? "text-emerald-400" : "text-amber-400"}`}>
                    {h.is_valid && !h.suppressed ? "Exec" : h.no_model ? "No Model" : h.suppressed ? "Supp" : "Held"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
