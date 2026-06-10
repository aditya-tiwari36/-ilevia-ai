export function StatusPill({ status, compact = false }) {
  const map = {
    "Executed":           { dot: "bg-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    "Suppressed":         { dot: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
    "Overridden by User": { dot: "bg-sky-400",     text: "text-sky-700",     bg: "bg-sky-50 border-sky-200" },
    "No Model":           { dot: "bg-rose-400",    text: "text-rose-700",    bg: "bg-rose-50 border-rose-200" },
    "Held":               { dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-50 border-slate-200" },
  };
  const s = map[status] ?? map["Held"];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold ${s.bg} ${s.text} ${compact ? "text-[10px]" : "text-xs"}`}>
      <span className={`rounded-full ${s.dot} ${compact ? "h-1.5 w-1.5" : "h-2 w-2"}`} />
      {status}
    </span>
  );
}
