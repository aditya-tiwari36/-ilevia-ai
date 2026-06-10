import { AnimatePresence, motion } from "framer-motion";
import { rooms } from "../../data/home.js";
import { useHome } from "../../context/HomeContext.jsx";
import { RoomCanvas } from "./RoomCanvas.jsx";
import { WeatherPanel } from "./WeatherPanel.jsx";
import { useState } from "react";
import { ReasonPanel } from "./ReasonPanel.jsx";
import { formatLatency } from "../../lib/smartHome.js";
import { Wifi, WifiOff, RefreshCw, AlertCircle, Eye, EyeOff, CloudSun } from "lucide-react";
import { statusFor } from "../../lib/smartHome.js";

const roomNames = Object.keys(rooms);
const beachUrl = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2400&q=85";

function PipelineStatusBar({ pollStats, isLoading }) {
  const { count, lastPollAt, latencyMs, source, batchStats } = pollStats;

  const isLive = source === "api";
  const isFallback = source === "fallback";
  const isError = source === "error";

  const lastPollLabel = lastPollAt
    ? new Date(lastPollAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div className="mt-2 flex flex-shrink-0 flex-wrap items-center gap-2 md:gap-3 rounded-2xl bg-white/75 px-3 md:px-4 py-2.5 shadow-sm backdrop-blur-xl text-xs">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        {isLoading ? (
          <RefreshCw size={11} className="animate-spin text-[#57706a]" />
        ) : isError ? (
          <AlertCircle size={11} className="text-red-500" />
        ) : isLive ? (
          <motion.span
            className="h-2 w-2 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        ) : isFallback ? (
          <WifiOff size={11} className="text-amber-500" />
        ) : (
          <Wifi size={11} className="text-[#57706a]" />
        )}
        <span className={`font-semibold ${isLive ? "text-emerald-600" : isFallback ? "text-amber-600" : isError ? "text-red-500" : "text-[#57706a]"}`}>
          {isLoading ? "Connecting…" : isError ? "No source" : isLive ? "Live — ML Pipeline" : "Fallback (bundled JSON)"}
        </span>
      </div>

      <span className="text-[#c0d0ca]">·</span>

      {/* Last poll time */}
      <span className="text-[#57706a]">
        Last sync: <span className="font-medium text-[#172321]">{lastPollLabel}</span>
      </span>

      <span className="text-[#c0d0ca]">·</span>

      {/* Latency */}
      <span className="text-[#57706a]">
        Latency: <span className="font-medium text-[#172321]">{formatLatency(latencyMs)}</span>
      </span>

      <span className="text-[#c0d0ca]">·</span>

      {/* Poll count */}
      <span className="text-[#57706a]">Polls: <span className="font-medium text-[#172321]">{count}</span></span>

      {/* Batch summary */}
      {batchStats && batchStats.total > 0 && (
        <>
          <span className="text-[#c0d0ca]">·</span>
          <span className="text-[#57706a]">
            Batch: <span className="font-medium text-emerald-600">{batchStats.executed} exec</span>
            {" / "}
            <span className="font-medium text-amber-600">{batchStats.suppressed + batchStats.noModel} held</span>
          </span>
        </>
      )}
    </div>
  );
}

export function RoomSection() {
  const {
    activeRoom, setActiveRoom,
    devices, selectedDevice, selectedDeviceId, setSelectedDeviceId,
    selectedDeviceSummary, selectedDeviceHistory, selectedDeviceOverrides,
    changeDevice,
    weather, weatherLocation,
    commandsPayload, overrides, simulationCommands,
    demoMode, setDemoMode, modelStatus,
    pollStats, isLoading
  } = useHome();

  const [showWeather, setShowWeather] = useState(false);

  const activeDevices = rooms[activeRoom].devices.map(d => devices[d.id] ?? d);

  return (
    <motion.section
      className="relative min-h-screen px-5 py-5 lg:px-7 bg-cover bg-center"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(10,24,32,.52) 0%, rgba(14,38,50,.46) 100%), url(${beachUrl})`
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Bug 4 FIX: grid uses h-[calc(100vh-40px)] so the aside never
          overflows. The grid itself is the room-section-grid class
          so the responsive CSS can collapse it on narrower screens. */}
      <div className="room-section-grid mx-auto grid max-w-[1800px] h-[calc(100vh-40px)] grid-cols-[1fr_360px] gap-4 xl:grid-cols-[1fr_390px]">
        {/* Left: header + status + room canvas */}
        <div className="flex min-w-0 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex flex-shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="text-white">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/60">Ilevia AI Home</p>
              <h1 className="text-xl md:text-3xl font-semibold tracking-tight text-white">Smart living, actively learned</h1>
            </div>
            
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              {/* Demo Mode Button */}
              <button
                onClick={() => setDemoMode(v => !v)}
                className={`flex items-center gap-2 rounded-full px-3 md:px-4 py-2 text-sm font-semibold shadow-md backdrop-blur-xl transition ${
                  demoMode ? "bg-[#172321] text-white" : "bg-white/80 text-[#40514d] hover:text-[#172321]"
                }`}
              >
                {demoMode ? <Eye size={16} /> : <EyeOff size={16} />}
                <span className="hidden sm:inline">Demo</span>
              </button>

              {/* Weather Button */}
              <div className="relative">
                <button
                  onClick={() => setShowWeather(v => !v)}
                  className={`flex items-center gap-2 rounded-full px-3 md:px-4 py-2 text-sm font-semibold shadow-md backdrop-blur-xl transition ${
                    showWeather ? "bg-[#35766f] text-white" : "bg-white/80 text-[#40514d] hover:text-[#172321]"
                  }`}
                >
                  <CloudSun size={18} />
                  {weather.temp}°C
                </button>
                <AnimatePresence>
                  {showWeather && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 top-full mt-3 z-50 w-[calc(100vw-2rem)] max-w-[360px]"
                    >
                      <WeatherPanel weather={weather} location={weatherLocation} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Room selector — horizontally scrollable on mobile */}
              <nav className="flex rounded-full bg-white/80 p-1 shadow-md backdrop-blur-xl overflow-x-auto max-w-[calc(100vw-8rem)] md:max-w-none" style={{ scrollbarWidth: 'none' }}>
                {roomNames.map(room => (
                  <button
                    key={room}
                    onClick={() => setActiveRoom(room)}
                    className={`relative flex-shrink-0 rounded-full px-2.5 md:px-3.5 py-2 text-xs md:text-sm font-semibold transition-colors duration-200 ${
                      activeRoom === room ? "text-white" : "text-[#40514d] hover:text-[#172321]"
                    }`}
                  >
                    {activeRoom === room && (
                      <motion.span
                        layoutId="roomPill"
                        className="absolute inset-0 rounded-full bg-[#172321]"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{room}</span>
                  </button>
                ))}
              </nav>
            </div>
          </header>

          {/* Pipeline status bar */}
          <PipelineStatusBar pollStats={pollStats} isLoading={isLoading} />

          {/* Room canvas fills remaining space */}
          <div className="flex-1 min-h-0 mt-3 relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRoom}
                className="h-full"
                initial={{ opacity: 0, y: 12, scale: 0.988 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.994 }}
                transition={{ duration: 0.38, ease: "easeOut" }}
              >
                <RoomCanvas
                  room={activeRoom}
                  devices={activeDevices}
                  selectedId={selectedDeviceId}
                  onSelect={setSelectedDeviceId}
                  onChange={changeDevice}
                />
              </motion.div>
            </AnimatePresence>

            {/* Float AI Decision Stream over canvas when Demo Mode is active */}
            <AnimatePresence>
              {demoMode && (
                <motion.div
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="absolute bottom-5 right-5 z-40 w-[340px] max-h-[300px] flex flex-col overflow-hidden rounded-2xl bg-[#172321]/92 p-4 text-white shadow-2xl backdrop-blur-xl border border-white/10"
                >
                  <div className="mb-3 flex items-center justify-between flex-shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">AI Decision Stream</p>
                    <p className="text-[10px] text-[#57cabe]">{modelStatus?.models_loaded ?? 0} models</p>
                  </div>
                  <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                    {[...(simulationCommands ?? []), ...(commandsPayload.commands ?? [])].slice(0, 10).map((cmd, i) => (
                      <div key={`${cmd.device_id}-${cmd.parameter}-${cmd.timestamp}-${i}`} className="rounded-xl bg-white/8 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="truncate font-semibold">{cmd.device_id}</span>
                          <span className="ml-auto text-[#57cabe]">{cmd.confidence == null ? "reg" : `${Math.round(cmd.confidence * 100)}%`}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-white/55">
                          {cmd.parameter} {"->"} {String(cmd.validated_value ?? "held")} · {statusFor(cmd)}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-white/35">{cmd.reason}</p>
                      </div>
                    ))}
                    {overrides.slice(0, 4).map((ev, i) => (
                      <div key={`${ev.timestamp}-${i}`} className="rounded-xl bg-amber-400/12 px-3 py-2 text-xs border border-amber-400/20">
                        Human override: {ev.device_name ?? ev.device} {ev.parameter_changed} {"->"} {String(ev.new_value)}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: side panels — Now fully dedicated to the AI Reason Panel */}
        <aside className="room-section-aside flex flex-col gap-3 min-h-0 h-full overflow-hidden">
          <div className="room-reason-slot flex flex-1 min-h-0 h-full">
            <ReasonPanel
              device={selectedDevice}
              changeDevice={changeDevice}
              generatedAt={commandsPayload.generated_at}
              summary={selectedDeviceSummary}
              deviceHistory={selectedDeviceHistory}
              deviceOverrides={selectedDeviceOverrides}
              weather={weather}
            />
          </div>
        </aside>
      </div>
    </motion.section>
  );
}
