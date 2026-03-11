type Props = {
  score: number;
  compact?: boolean;
};

function getScoreClass(score: number): string {
  if (score >= 80) {
    return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  }
  if (score >= 60) {
    return "text-amber-300 border-amber-500/40 bg-amber-500/10";
  }
  return "text-red-400 border-red-500/40 bg-red-500/10";
}

export default function PerformanceScore({ score, compact = false }: Props) {
  const safeScore = Number.isFinite(score) ? score : 0;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center rounded-lg border px-2 py-1 text-xs font-semibold ${getScoreClass(safeScore)}`}
      >
        {safeScore.toFixed(1)}
      </span>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        AI Performance Score
      </p>
      <div
        className={`inline-flex mt-3 rounded-xl border px-4 py-2 text-2xl font-bold ${getScoreClass(safeScore)}`}
      >
        {safeScore.toFixed(1)}
      </div>
    </div>
  );
}
