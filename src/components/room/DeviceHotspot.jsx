import { motion } from "framer-motion";
import { Fan, Gauge, Lightbulb, Power, Radio, SlidersHorizontal, Snowflake, Sprout, Video } from "lucide-react";
import { deviceActive } from "../../lib/smartHome.js";

const KIND_ICONS = {
  light: Lightbulb,
  ac: Snowflake,
  fan: Fan,
  blinds: SlidersHorizontal,
  speaker: Radio,
  irrigation: Sprout,
  camera: Video,
  plug: Power
};

/**
 * Bug 5 FIX — Device hotspot hover layout shift
 *
 * Root cause: the framer-motion whileHover scale transform was being applied
 * to the same element that uses translate(-50%, -50%) for centering.
 * When framer sets an inline transform for scale, it replaces the CSS
 * transform entirely, losing the translate offset, which causes the button
 * to jump to a different position.
 *
 * Fix: wrap the icon in a separate inner <div> that receives the scale
 * transform. The outer <motion.button> retains only the CSS positioning
 * (left, top, plus the translate centering class which stays stable).
 * The whileHover / whileTap props are moved to the inner wrapper so
 * they never touch the outer element's transform.
 *
 * Additionally: the framer-motion `animate` rotation for the fan is on a
 * nested <motion.div> inside the scaler — this is unaffected.
 */
export function DeviceHotspot({ device, selected, onSelect }) {
  const active = deviceActive(device);
  const Icon = KIND_ICONS[device.kind] ?? Gauge;
  const fanOn = device.kind === "fan" && active;
  const fanSpeed = device.params?.["Fan Speed"] ?? "Low";
  const fanDuration = fanSpeed === "High" ? 0.6 : fanSpeed === "Medium" ? 1.1 : 1.9;

  return (
    <button
      type="button"
      onClick={() => onSelect(device.id)}
      className={`device-hotspot ${selected ? "selected" : ""} ${active ? "active" : ""}`}
      style={{ left: `${device.x}%`, top: `${device.y}%` }}
      title={device.name}
    >
      {/* Active effect ring — pointer-events:none so it doesn't affect the button hit-area */}
      {active && <span className={`device-effect ${device.kind}`} />}

      {/* Bug 5 FIX: scale/tap transforms are on this inner wrapper, NOT the
          outer button, so positioning (translate -50% -50%) is never clobbered */}
      <motion.span
        className="relative z-10 flex items-center justify-center"
        whileHover={{ scale: 1.14 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
      >
        {fanOn ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: fanDuration, ease: "linear" }}
          >
            <Icon size={22} />
          </motion.div>
        ) : (
          <Icon size={22} />
        )}
      </motion.span>

      {/* Selected pulse ring */}
      {selected && (
        <motion.span
          className="absolute inset-[-10px] rounded-full border-2 border-[#57cabe]/40"
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.2, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </button>
  );
}
