type KpiCardProps = {
  title: string;
  value: string;
  positive?: boolean;
};

export default function KpiCard({
  title,
  value,
  positive,
}: KpiCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <p className="text-slate-400 text-sm uppercase tracking-wide">
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-semibold ${
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
