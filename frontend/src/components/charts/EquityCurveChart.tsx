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
  const d = new Date(ts);
  return d.toLocaleDateString();
}

function formatFullDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function EquityCurveChart({ equity }: Props) {
  if (!equity || equity.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-slate-500">
        No equity data.
      </div>
    );
  }

  const initial = equity[0].equity;
  const final = equity[equity.length - 1].equity;
  const positive = final >= initial;

  return (
    <div className="h-80 w-full min-h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={equity}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />

          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => formatDate(Number(value))}
            stroke="#64748b"
            tick={{ fill: "#64748b", fontSize: 12 }}
          />

          <YAxis
            dataKey="equity"
            stroke="#64748b"
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickFormatter={(v) => Number(v).toFixed(0)}
            domain={["auto", "auto"]}
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
            fill={positive ? "#22c55e20" : "#ef444420"}
          />

          <Line
            type="monotone"
            dataKey="equity"
            stroke={positive ? "#22c55e" : "#ef4444"}
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
