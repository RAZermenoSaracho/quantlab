import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Area,
} from "recharts";
import type {
  Formatter,
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

type EquityPoint = {
  timestamp: number;
  equity: number;
};

type Props = {
  equity: EquityPoint[];
};

const CHART_HEIGHT = 320;

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

function formatFullDate(ts: number) {
  return new Date(ts).toLocaleString();
}

const equityTooltipFormatter: Formatter<ValueType, NameType> = (value) => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const numericValue =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? Number(rawValue)
        : NaN;

  return [
    `${Number.isFinite(numericValue) ? numericValue.toFixed(2) : "0.00"} USDT`,
    "Equity",
  ];
};

export default function EquityCurveChart({ equity }: Props) {
  if (!equity?.length) {
    return (
      <div
        className="flex items-center justify-center text-slate-500"
        style={{ height: CHART_HEIGHT }}
      >
        No equity data.
      </div>
    );
  }

  const initial = Number(equity[0]?.equity ?? 0);
  const final = Number(equity[equity.length - 1]?.equity ?? initial);
  const positive = final >= initial;
  const values = equity.map((point) => Number(point.equity ?? 0));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue;
  const padding = spread > 0 ? spread * 0.2 : Math.max(Math.abs(maxValue) * 0.05, 1);
  const chartMin = minValue - padding;
  const chartMax = maxValue + padding;

  return (
    <div
      className="w-full max-w-full min-w-0 min-h-[320px] overflow-hidden"
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0} minHeight={CHART_HEIGHT}>
        <LineChart data={equity}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />

          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => formatDate(Number(value))}
            stroke="#64748b"
            tick={{ fill: "#64748b", fontSize: 12 }}
            minTickGap={30}
          />

          <YAxis
            dataKey="equity"
            domain={[chartMin, chartMax]}
            stroke="#64748b"
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickFormatter={(v) => Number(v).toFixed(0)}
            width={60}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
            }}
            labelFormatter={(value) =>
              `Date: ${formatFullDate(Number(value))}`
            }
            formatter={equityTooltipFormatter}
          />

          <ReferenceLine
            y={initial}
            stroke="#475569"
            strokeDasharray="4 4"
          />

          <Area
            type="monotone"
            dataKey="equity"
            stroke="none"
            fill={
              positive
                ? "rgba(34,197,94,0.12)"
                : "rgba(239,68,68,0.12)"
            }
          />

          <Line
            type="monotone"
            dataKey="equity"
            stroke={positive ? "#22c55e" : "#ef4444"}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
