import { motion } from "framer-motion";
import { useState } from "react";
import { GlassShell } from "../shared/GlassShell.jsx";
import { CommandStream } from "./CommandStream.jsx";
import { PerformanceTab } from "./PerformanceTab.jsx";
import { DeviceAnalytics } from "./DeviceAnalytics.jsx";
import { LearningLoop } from "./LearningLoop.jsx";
import { ModelStatusPanel } from "./ModelStatusPanel.jsx";
import { useHome } from "../../context/HomeContext.jsx";

const TABS = ["Command Stream", "Model Status", "Performance", "Device Analytics", "Learning Loop"];

export function ConsoleSection() {
  const { commandsPayload, overrides, devices } = useHome();
  const [tab, setTab] = useState("Command Stream");
  const commands = commandsPayload.commands ?? [];

  return (
    <GlassShell title="Console" kicker="Engineering & AI Monitoring">
      <div className="glass-panel flex flex-col" style={{ minHeight: "min(700px, calc(100vh - 170px))" }}>
        {/* Tab bar */}
        <div className="mb-6 flex flex-shrink-0 gap-1.5 overflow-x-auto">
          {TABS.map(name => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`relative flex-shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-200 ${
                tab === name ? "text-[#0a1a22]" : "text-white/60 hover:text-white"
              }`}
            >
              {tab === name && (
                <motion.span
                  layoutId="consolePill"
                  className="absolute inset-0 rounded-full bg-white"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{name}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {tab === "Command Stream" && <CommandStream commands={commands} />}
            {tab === "Model Status" && <ModelStatusPanel />}
            {tab === "Performance" && <PerformanceTab commands={commands} overrides={overrides} />}
            {tab === "Device Analytics" && <DeviceAnalytics devices={devices} />}
            {tab === "Learning Loop" && <LearningLoop overrides={overrides} />}
          </motion.div>
        </div>
      </div>
    </GlassShell>
  );
}
