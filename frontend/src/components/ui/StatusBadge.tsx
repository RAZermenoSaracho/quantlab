export function StatusBadge({ status }: { status: string }) {
  const base =
    "px-3 py-1 rounded-full text-xs font-semibold tracking-wide border";

  const styles: Record<string, string> = {
    COMPLETED:
      "bg-green-900/40 text-green-400 border-green-500/30",
    RUNNING:
      "bg-yellow-900/40 text-yellow-400 border-yellow-500/30 animate-pulse",
    FAILED:
      "bg-red-900/40 text-red-400 border-red-500/30",
    PENDING:
      "bg-blue-900/40 text-blue-400 border-blue-500/30",
  };

  return (
    <span className={`${base} ${styles[status] || "bg-slate-700 text-slate-400 border-slate-600"}`}>
      {status}
    </span>
  );
}
