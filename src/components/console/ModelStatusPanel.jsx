import { Cpu, Database, FileWarning, History, SlidersHorizontal } from "lucide-react";
import { useHome } from "../../context/HomeContext.jsx";

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
      <div className="mb-3 flex items-center justify-between">
        <Icon size={16} className="text-[#57cabe]" />
        <span className="text-xl font-semibold text-white">{value ?? "—"}</span>
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-white/35">{sub}</p>}
    </div>
  );
}

export function ModelStatusPanel() {
  const { modelStatus, pollStats } = useHome();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Cpu} label="Models Loaded" value={modelStatus?.models_loaded} sub="joblib files on disk" />
        <Stat icon={Database} label="Models Available" value={modelStatus?.models_available} sub="OK rows in model_metrics.csv" />
        <Stat icon={FileWarning} label="Models Missing" value={modelStatus?.models_missing} sub="dropped or below threshold" />
        <Stat icon={History} label="Commands Processed" value={modelStatus?.commands_processed} sub={`polls ${pollStats.count}`} />
        {/* Fix 3.5: removed redundant suppression_threshold (identical to confidence_threshold) */}
        <Stat icon={SlidersHorizontal} label="Confidence Threshold" value={modelStatus?.confidence_threshold} sub="classifier gate (≥0.70 to execute)" />
        <Stat icon={Database} label="Overrides Recorded" value={modelStatus?.overrides_recorded} sub="override_events.json" />
        <Stat icon={Database} label="Learning Events" value={modelStatus?.learning_events_generated} sub="training candidates" />
        <Stat icon={Database} label="Training Samples" value={modelStatus?.training_dataset_size ?? 0} sub="total rows in activity log" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
          {/* Fix 3.5: prefer last_retraining_time (live Python runtime) over
              last_training_time (CSV timestamp). Two sources existed with no reconciliation. */}
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Last Retrained</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {modelStatus?.last_retraining_time
              ? new Date(modelStatus.last_retraining_time).toLocaleString()
              : modelStatus?.last_training_time ?? "Not reported"}
          </p>
          {modelStatus?.last_retraining_time && modelStatus?.last_training_time &&
            modelStatus.last_retraining_time !== modelStatus.last_training_time && (
            <p className="mt-1 text-[9px] text-white/30">CSV: {modelStatus.last_training_time}</p>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Last Prediction Time</p>
          <p className="mt-2 text-sm font-semibold text-white">{modelStatus?.last_prediction_time ?? "Waiting for commands.json"}</p>
        </div>
      </div>

      {modelStatus?.missing_models?.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-white/40">Recent Missing / Dropped Models</p>
          <div className="grid grid-cols-2 gap-2">
            {modelStatus.missing_models.map((model, i) => (
              <div key={`${model.device_id}-${model.parameter}-${i}`} className="rounded-xl bg-white/8 px-3 py-2 text-xs">
                <p className="font-semibold text-white">{model.device_id}</p>
                <p className="text-white/50">{model.parameter}</p>
                <p className="mt-1 text-amber-300/80">{model.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
