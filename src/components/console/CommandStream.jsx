import { normalizeParamName, displayValue, statusFor } from "../../lib/smartHome.js";
import { StatusPill } from "../shared/StatusPill.jsx";
import { motion } from "framer-motion";

export function CommandStream({ commands }) {
  if (!commands.length) {
    return (
      <div className="flex h-64 items-center justify-center text-white/40">
        <p>No commands received yet. Waiting for ML pipeline…</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Desktop header row — hidden on mobile */}
      <div className="hidden md:grid grid-cols-[2fr_1.2fr_1fr_0.8fr_1fr] gap-4 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
        <span>Device</span>
        <span>Parameter → Value</span>
        <span>Timestamp</span>
        <span>Confidence</span>
        <span>Status</span>
      </div>

      {commands.map((cmd, i) => {
        const status = statusFor(cmd);
        const conf = cmd.confidence !== null && cmd.confidence !== undefined
          ? `${Math.round(cmd.confidence * 100)}%`
          : "regression";
        return (
          <motion.div
            key={`${cmd.device_id}-${cmd.parameter}-${i}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
          >
            {/* Mobile card view */}
            <div className="md:hidden rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-white text-sm leading-tight">{cmd.device_id}</p>
                  <p className="text-[10px] text-white/40">{cmd.device_type || "Unknown type"}</p>
                </div>
                <StatusPill status={status} compact />
              </div>
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <span className="text-white/60">{normalizeParamName(cmd.parameter)}</span>
                <span className="text-[#57cabe] font-medium">→ {displayValue(cmd.validated_value)}</span>
                <span className="text-white/40 ml-auto">{conf}</span>
              </div>
              <p className="text-[10px] text-white/35">{new Date(cmd.timestamp).toLocaleTimeString()}</p>
            </div>

            {/* Desktop row view */}
            <div className="hidden md:grid grid-cols-[2fr_1.2fr_1fr_0.8fr_1fr] items-center gap-4 rounded-2xl border border-white/10 bg-white/8 px-4 py-3.5 text-sm backdrop-blur">
              <div>
                <p className="font-semibold text-white leading-tight">{cmd.device_id}</p>
                <p className="text-[10px] text-white/40 mt-0.5">{cmd.device_type || "Unknown type"}</p>
              </div>
              <div>
                <p className="text-white/80 text-xs">{normalizeParamName(cmd.parameter)}</p>
                <p className="text-[#57cabe] text-xs font-medium">
                  → {displayValue(cmd.validated_value)}
                </p>
              </div>
              <p className="text-xs text-white/55">{new Date(cmd.timestamp).toLocaleTimeString()}</p>
              <p className="text-xs text-white/55">{conf}</p>
              <StatusPill status={status} compact />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
