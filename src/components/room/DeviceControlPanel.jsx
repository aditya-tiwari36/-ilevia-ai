import { AnimatePresence, motion } from "framer-motion";
import { Fan, Lightbulb, Snowflake, Speaker, Sprout, Video, Power, X, Blinds, PlugZap } from "lucide-react";

const TEMP_OPTIONS = ["Warm", "Neutral", "Cool"];
const FAN_SPEEDS = ["Low", "Medium", "High"];
const AC_MODES = ["Off", "Cool", "Dry", "Fan", "Auto"];

const ICONS = {
  light:      Lightbulb,
  ac:         Snowflake,
  fan:        Fan,
  speaker:    Speaker,
  irrigation: Sprout,
  camera:     Video,
  blinds:     Blinds,
  plug:       PlugZap,
};

function Segment({ options, value, onChange }) {
  return (
    <div className="flex rounded-full bg-[#132420]/10 p-1">
      {options.map(option => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`relative flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
            value === option ? "text-white" : "text-[#40514d]"
          }`}
        >
          {value === option && <motion.span layoutId={`seg-${options.join("-")}`} className="absolute inset-0 rounded-full bg-[#172321]" />}
          <span className="relative z-10">{option}</span>
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">
        {label}
        <span className="rounded-full bg-[#57cabe]/14 px-2 py-0.5 text-[#174b45] tracking-normal">
          {value}{suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(value) || min}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[#57cabe]"
      />
    </label>
  );
}

function Toggle({ active, onClick, label = "Power" }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition ${
        active ? "bg-[#172321] text-white" : "bg-[#172321]/10 text-[#40514d]"
      }`}
    >
      <Power size={14} />
      {label}: {active ? "On" : "Off"}
    </button>
  );
}

export function DeviceControlPanel({ device, onChange, onClose }) {
  const Icon = ICONS[device?.kind] ?? Power;
  const params = device?.params ?? {};
  const isLightOn = params["Power State"] === "On";
  const isFanOn = params["Power State"] === "On";
  const acMode = params["Operation Mode"] ?? "Off";
  const speakerOn = params["Playback State"] === "Playing";
  const watering = params["Zone 1 State"] === "Watering";
  const privacyOn = params["Privacy Mode"] === "On";

  return (
    <AnimatePresence>
      {device && (
        <>
          {/* ── Mobile: fixed bottom sheet ─────────────────────── */}
          <motion.div
            key={`mobile-${device.id}`}
            className="md:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] border-t border-white/70 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
          >
            {/* Drag handle */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#172321]/20" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#172321] text-white">
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#172321]">{device.name}</p>
                  <p className="text-xs text-[#57706a]">{device.room}</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-full bg-[#172321]/8 p-2.5 text-[#40514d] hover:bg-[#172321]/14">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-0.5">
              {device.kind === "light" && (
                <>
                  <Toggle active={isLightOn} onClick={() => onChange(device.id, "Power State", isLightOn ? "Off" : "On")} />
                  <Slider label="Brightness" value={params.Brightness ?? 0} min={0} max={100} suffix="%" onChange={v => onChange(device.id, "Brightness", v)} />
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">Color Temperature</p>
                    <Segment options={TEMP_OPTIONS} value={params["Color Temperature"] ?? "Warm"} onChange={v => onChange(device.id, "Color Temperature", v)} />
                  </div>
                </>
              )}
              {device.kind === "ac" && (
                <>
                  <Toggle active={acMode !== "Off"} onClick={() => onChange(device.id, "Operation Mode", acMode === "Off" ? "Cool" : "Off")} />
                  <Slider label="Temperature" value={Math.round(params["Target Temperature"] ?? 24)} min={16} max={30} suffix="C" onChange={v => onChange(device.id, "Target Temperature", v)} />
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">Fan Speed</p>
                    <Segment options={FAN_SPEEDS} value={params["Fan Speed"] ?? "Medium"} onChange={v => onChange(device.id, "Fan Speed", v)} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">Mode</p>
                    <Segment options={AC_MODES} value={acMode} onChange={v => onChange(device.id, "Operation Mode", v)} />
                  </div>
                </>
              )}
              {device.kind === "fan" && (
                <>
                  <Toggle active={isFanOn} onClick={() => onChange(device.id, "Power State", isFanOn ? "Off" : "On")} />
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">Speed</p>
                    <Segment options={FAN_SPEEDS} value={params["Fan Speed"] ?? "Low"} onChange={v => onChange(device.id, "Fan Speed", v)} />
                  </div>
                </>
              )}
              {device.kind === "speaker" && (
                <>
                  <Toggle active={speakerOn} onClick={() => onChange(device.id, "Playback State", speakerOn ? "Paused" : "Playing")} />
                  <Slider label="Volume" value={Math.round(params["Volume Level"] ?? 0)} min={0} max={100} suffix="%" onChange={v => onChange(device.id, "Volume Level", v)} />
                </>
              )}
              {device.kind === "irrigation" && (
                <>
                  <Toggle active={watering} onClick={() => onChange(device.id, "Zone 1 State", watering ? "Idle" : "Watering")} />
                  <Slider label="Duration" value={params["Duration Minutes"] ?? 10} min={1} max={60} suffix="m" onChange={v => onChange(device.id, "Duration Minutes", v)} />
                </>
              )}
              {device.kind === "camera" && (
                <Toggle active={privacyOn} label="Privacy" onClick={() => onChange(device.id, "Privacy Mode", privacyOn ? "Off" : "On")} />
              )}
              {device.kind === "blinds" && (
                <Slider label="Open %" value={Math.round(params["Open/Close Percentage"] ?? 50)} min={0} max={100} suffix="%" onChange={v => onChange(device.id, "Open/Close Percentage", v)} />
              )}
              {device.kind === "plug" && (
                <Toggle active={params["Switch State"] === "On"} label="Switch" onClick={() => onChange(device.id, "Switch State", params["Switch State"] === "On" ? "Off" : "On")} />
              )}
            </div>
          </motion.div>

          {/* Mobile backdrop */}
          <motion.div
            key={`backdrop-${device.id}`}
            className="md:hidden fixed inset-0 z-40 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* ── Desktop: absolute floating card (unchanged) ──────── */}
          <motion.div
            key={`desktop-${device.id}`}
            className="hidden md:block absolute z-30 w-[320px] max-w-[calc(100%-24px)] rounded-[24px] border border-white/70 bg-white/92 p-4 shadow-2xl backdrop-blur-2xl"
            style={{
              left: `clamp(12px, ${device.x}%, calc(100% - 332px))`,
              top: `clamp(10px, ${device.y + 7}%, calc(100% - 360px))`
            }}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#172321] text-white">
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#172321]">{device.name}</p>
                  <p className="text-xs text-[#57706a]">{device.room}</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-full bg-[#172321]/8 p-2 text-[#40514d] hover:bg-[#172321]/14">
                <X size={15} />
              </button>
            </div>

            <div className="space-y-4 max-h-[280px] overflow-y-auto pr-0.5">
              {device.kind === "light" && (
                <>
                  <Toggle active={isLightOn} onClick={() => onChange(device.id, "Power State", isLightOn ? "Off" : "On")} />
                  <Slider label="Brightness" value={params.Brightness ?? 0} min={0} max={100} suffix="%" onChange={v => onChange(device.id, "Brightness", v)} />
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">Color Temperature</p>
                    <Segment options={TEMP_OPTIONS} value={params["Color Temperature"] ?? "Warm"} onChange={v => onChange(device.id, "Color Temperature", v)} />
                  </div>
                </>
              )}
              {device.kind === "ac" && (
                <>
                  <Toggle active={acMode !== "Off"} onClick={() => onChange(device.id, "Operation Mode", acMode === "Off" ? "Cool" : "Off")} />
                  <Slider label="Temperature" value={Math.round(params["Target Temperature"] ?? 24)} min={16} max={30} suffix="C" onChange={v => onChange(device.id, "Target Temperature", v)} />
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">Fan Speed</p>
                    <Segment options={FAN_SPEEDS} value={params["Fan Speed"] ?? "Medium"} onChange={v => onChange(device.id, "Fan Speed", v)} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">Mode</p>
                    <Segment options={AC_MODES} value={acMode} onChange={v => onChange(device.id, "Operation Mode", v)} />
                  </div>
                </>
              )}
              {device.kind === "fan" && (
                <>
                  <Toggle active={isFanOn} onClick={() => onChange(device.id, "Power State", isFanOn ? "Off" : "On")} />
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#57706a]">Speed</p>
                    <Segment options={FAN_SPEEDS} value={params["Fan Speed"] ?? "Low"} onChange={v => onChange(device.id, "Fan Speed", v)} />
                  </div>
                </>
              )}
              {device.kind === "speaker" && (
                <>
                  <Toggle active={speakerOn} onClick={() => onChange(device.id, "Playback State", speakerOn ? "Paused" : "Playing")} />
                  <Slider label="Volume" value={Math.round(params["Volume Level"] ?? 0)} min={0} max={100} suffix="%" onChange={v => onChange(device.id, "Volume Level", v)} />
                </>
              )}
              {device.kind === "irrigation" && (
                <>
                  <Toggle active={watering} onClick={() => onChange(device.id, "Zone 1 State", watering ? "Idle" : "Watering")} />
                  <Slider label="Duration" value={params["Duration Minutes"] ?? 10} min={1} max={60} suffix="m" onChange={v => onChange(device.id, "Duration Minutes", v)} />
                </>
              )}
              {device.kind === "camera" && (
                <Toggle active={privacyOn} label="Privacy" onClick={() => onChange(device.id, "Privacy Mode", privacyOn ? "Off" : "On")} />
              )}
              {device.kind === "blinds" && (
                <Slider label="Open %" value={Math.round(params["Open/Close Percentage"] ?? 50)} min={0} max={100} suffix="%" onChange={v => onChange(device.id, "Open/Close Percentage", v)} />
              )}
              {device.kind === "plug" && (
                <Toggle active={params["Switch State"] === "On"} label="Switch" onClick={() => onChange(device.id, "Switch State", params["Switch State"] === "On" ? "Off" : "On")} />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
