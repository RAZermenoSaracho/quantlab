interface Props {
  start: string;
  end: string;
}

export default function DurationInfo({ start, end }: Props) {
  if (!start || !end) return null;

  const startDate = new Date(start);
  const endDate = new Date(end);

  const diffDays =
    (endDate.getTime() - startDate.getTime()) /
    (1000 * 60 * 60 * 24);

  if (diffDays <= 0) {
    return (
      <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
        Invalid range: End date must be after start date.
      </div>
    );
  }

  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  const remainingDays = Math.floor(diffDays % 30);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">

      <div className="text-sm text-slate-300">
        Backtest Duration:
      </div>

      <div className="text-2xl font-semibold text-sky-400">
        {Math.floor(diffDays)} days
      </div>

      <div className="text-xs text-slate-500">
        ~ {years}y {months}m {remainingDays}d
      </div>

    </div>
  );
}