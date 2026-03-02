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

type EquityPoint = {
  timestamp: number;
  equity: number;
};

type Props = {
  equity: EquityPoint[];
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

function formatFullDate(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function EquityCurveChart({ equity }: Props) {
  if (!equity?.length) {
    return (
      <div className="h-80 flex items-center justify-center text-slate-500">
        No equity data.
      </div>
    );
  }

  const initial = Number(equity[0]?.equity ?? 0);
  const final = Number(equity[equity.length - 1]?.equity ?? initial);
  const positive = final >= initial;

  return (
    <div
      className="w-full"
      style={{
        height: 320,
        minWidth: 0,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
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
            formatter={(value: any) => [
              `${Number(value).toFixed(2)} USDT`,
              "Equity",
            ]}
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
