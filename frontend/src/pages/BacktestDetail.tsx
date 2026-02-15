import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getBacktest } from "../services/backtest.service";

type Metrics = {
  total_return_percent: string;
  total_return_usdt: string;
  max_drawdown_percent: string;
  sharpe_ratio: string | null;
  win_rate_percent: string;
  profit_factor: string;
  total_trades: number;
};

type Trade = {
  entry_price: string;
  exit_price: string;
  pnl: string;
};

export default function BacktestDetail() {
  const { id } = useParams();
  const token = localStorage.getItem("token");

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      if (!id || !token) return;

      const data = await getBacktest(id, token);

      setMetrics(data.metrics);
      setTrades(data.trades);
      setSymbol(data.run.symbol);
      setTimeframe(data.run.timeframe);
      setStatus(data.run.status);
    }

    load();
  }, [id, token]);

  if (!metrics) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  // 🔢 Convert safely (because DB returns strings)
  const totalReturnPct = Number(metrics.total_return_percent || 0);
  const totalReturnUsdt = Number(metrics.total_return_usdt || 0);
  const winRate = Number(metrics.win_rate_percent || 0);
  const profitFactor = Number(metrics.profit_factor || 0);
  const maxDrawdown = Number(metrics.max_drawdown_percent || 0);

  return (
    <div className="space-y-8">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          {symbol} — {timeframe}
        </h1>

        <span
          className={`px-3 py-1 text-xs rounded ${
            status === "COMPLETED"
              ? "bg-green-900 text-green-400"
              : status === "RUNNING"
              ? "bg-yellow-900 text-yellow-400"
              : "bg-slate-700 text-slate-400"
          }`}
        >
          {status}
        </span>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">

        <MetricCard
          title="Total Return (USDT)"
          value={`${totalReturnUsdt.toFixed(2)}`}
          positive={totalReturnUsdt >= 0}
        />

        <MetricCard
          title="Return %"
          value={`${totalReturnPct.toFixed(2)}%`}
          positive={totalReturnPct >= 0}
        />

        <MetricCard
          title="Win Rate"
          value={`${winRate.toFixed(2)}%`}
          positive={winRate >= 50}
        />

        <MetricCard
          title="Profit Factor"
          value={profitFactor.toFixed(2)}
          positive={profitFactor >= 1}
        />

        <MetricCard
          title="Max Drawdown"
          value={`${maxDrawdown.toFixed(2)}%`}
          positive={false}
        />
      </div>

      {/* EQUITY PLACEHOLDER */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-4">
          Equity Curve
        </h2>

        <div className="h-80 bg-slate-900 rounded-lg flex items-center justify-center text-slate-500">
          Chart placeholder (Recharts next commit)
        </div>
      </div>

      {/* TRADES TABLE */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Entry</th>
              <th className="px-4 py-3 text-left">Exit</th>
              <th className="px-4 py-3 text-left">PnL</th>
            </tr>
          </thead>

          <tbody>
            {trades.map((t, index) => {
              const entry = Number(t.entry_price || 0);
              const exit = Number(t.exit_price || 0);
              const pnl = Number(t.pnl || 0);

              return (
                <tr
                  key={index}
                  className="border-t border-slate-700 hover:bg-slate-900"
                >
                  <td className="px-4 py-3 text-slate-400">
                    {entry.toFixed(2)}
                  </td>

                  <td className="px-4 py-3 text-slate-400">
                    {exit.toFixed(2)}
                  </td>

                  <td
                    className={`px-4 py-3 font-medium ${
                      pnl >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {pnl.toFixed(2)}
                  </td>
                </tr>
              );
            })}

            {trades.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-6 text-slate-500">
                  No trades.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type MetricCardProps = {
  title: string;
  value: string;
  positive?: boolean;
};

function MetricCard({ title, value, positive }: MetricCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-slate-400 text-xs uppercase tracking-wide">
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
