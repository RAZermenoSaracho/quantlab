import DateRangeSelector from "./DateRangeSelector";
import DurationInfo from "./DurationInfo";

interface Props {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

export default function DateSection({
  start,
  end,
  onChange,
}: Props) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-8 space-y-6">

      <div>
        <h2 className="text-lg font-semibold text-white">
          Backtest Period
        </h2>
        <p className="text-slate-400 text-sm">
          Select historical simulation window.
        </p>
      </div>

      <DateRangeSelector
        start={start}
        end={end}
        onChange={onChange}
      />

      {start && end && (
        <DurationInfo start={start} end={end} />
      )}

    </div>
  );
}