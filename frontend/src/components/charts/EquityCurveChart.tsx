import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Props = {
  equity: number[];
};

export default function EquityCurveChart({ equity }: Props) {
  // Convert array to chart-friendly format
  const data = equity.map((value, index) => ({
    step: index,
    equity: value,
  }));

  if (!equity || equity.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-slate-500">
        No equity data.
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />

          <XAxis
            dataKey="step"
            stroke="#64748b"
            tick={{ fill: "#64748b", fontSize: 12 }}
          />

          <YAxis
            stroke="#64748b"
            tick={{ fill: "#64748b", fontSize: 12 }}
            domain={["auto", "auto"]}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#94a3b8" }}
            itemStyle={{ color: "#38bdf8" }}
          />

          <Line
            type="monotone"
            dataKey="equity"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
