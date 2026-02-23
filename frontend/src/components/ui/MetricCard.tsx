type Props = {
  title: string;
  value: string;
  positive?: boolean;
};

export default function MetricCard({
  title,
  value,
  positive,
}: Props) {
  return (
    <div className="bg-slate-900 p-4 rounded-lg border border-slate-700">
      <p className="text-xs text-slate-400 uppercase tracking-wide">
        {title}
      </p>

      <p
        className={`mt-2 text-lg font-semibold ${
          positive === undefined
            ? "text-white"
            : positive
            ? "text-green-400"
            : "text-red-400"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
