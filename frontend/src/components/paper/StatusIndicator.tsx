import clsx from "clsx";

interface Props {
  label: string;
  active: boolean;
  tooltip?: string;
}

export default function StatusIndicator({
  label,
  active,
  tooltip,
}: Props) {
  return (
    <div
      className="flex items-center gap-2 text-xs text-slate-400"
      title={tooltip}
    >
      <span
        className={clsx(
          "w-2.5 h-2.5 rounded-full transition",
          active
            ? "bg-emerald-400 animate-pulse"
            : "bg-red-500"
        )}
      />
      <span className={active ? "text-emerald-400" : "text-red-400"}>
        {label}
      </span>
    </div>
  );
}