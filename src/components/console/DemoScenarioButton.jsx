import { useState } from "react";
import { Play, Loader2, Check } from "lucide-react";
import { useHome } from "../../context/HomeContext.jsx";

export function DemoScenarioButton() {
  const { setSimParams, setWeatherLocation } = useHome();
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState("");

  async function runDemo() {
    setStatus("running");
    setLog("Initializing Demo Scenario...");
    
    // 1. Set environment to HOT Summer in Dubai
    setTimeout(() => {
      setSimParams(prev => ({ ...prev, season: "Summer", month: "July", hour: 14 }));
      setWeatherLocation("Dubai");
      setLog("Weather changed: Dubai, Summer, 14:00 (Hot)");
    }, 1000);

    // 2. We mock an override injection.
    setTimeout(async () => {
      setLog("Injecting Human Override: LivingRoom AC -> 24°C");
      await fetch("/api/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          room: "Living Room",
          device: "LivingRoom_AC_1",
          device_type: "Smart Air Conditioner",
          parameter_changed: "Target Temperature",
          old_value: 22,
          new_value: 24,
          Trigger_Source: "Human",
          previous_automation: {
            parameter: "Target Temperature",
            validated_value: 22,
            confidence: 0.85,
            timestamp: new Date(Date.now() - 60000).toISOString(),
            reason: "Hot weather detected"
          }
        })
      });
    }, 3000);

    // 3. Force the Python Pipeline to retrain
    setTimeout(async () => {
      setLog("Calling /api/force-retrain...");
      try {
        const res = await fetch("/api/force-retrain", { method: "POST" });
        if (res.ok) {
          setLog("Retraining complete. Models swapped.");
          setStatus("done");
        } else {
          setLog("Retraining failed!");
          setStatus("idle");
        }
      } catch (err) {
        setLog("API unreachable.");
        setStatus("idle");
      }
    }, 5000);
    
    setTimeout(() => {
      setStatus(s => s === "done" ? "idle" : s);
      setLog("");
    }, 10000);
  }

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-white">CTO Verifiable Demo Flow</h4>
          <p className="mt-1 text-xs text-white/60">Injects a human override for AC (24°C) in Summer, and immediately retrains the ML model.</p>
        </div>
        <button
          onClick={runDemo}
          disabled={status !== "idle" && status !== "done"}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-xs font-bold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-400 disabled:opacity-50"
        >
          {status === "idle" && <><Play size={14} /> Run Demo</>}
          {status === "running" && <><Loader2 size={14} className="animate-spin" /> Running...</>}
          {status === "done" && <><Check size={14} /> Complete</>}
        </button>
      </div>
      {log && <div className="mt-3 text-xs font-mono text-rose-300 bg-black/20 p-2 rounded-lg">{log}</div>}
    </div>
  );
}
