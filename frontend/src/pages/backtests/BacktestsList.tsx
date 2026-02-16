import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllBacktests } from "../../services/backtest.service";

type Backtest = {
  id: string;
  symbol: string;
  timeframe: string;
  initial_balance: string;
  total_return_usdt: string;
  total_return_percent: string;
  total_trades: number;
  status: string;
  created_at: string;
};

type Props = {
  limit?: number;
  showTitle?: boolean;
};

export default function BacktestsList({ limit, showTitle = true }: Props) {
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const data = await getAllBacktests();
        setBacktests(data.backtests || data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const displayedBacktests = limit ? backtests.slice(0, limit) : backtests;

  return (
    <div className="space-y-6">
      {/* HEADER + CTA */}
      <div className="flex items-center justify-between">
        {showTitle && (
          <h1 className="text-2xl font-bold text-white">Backtests</h1>
        )}

        <button
          onClick={() => navigate("/backtests/new")}
          className="bg-sky-600 hover:bg-sky-700 px-4 py-2 rounded-lg text-white"
        >
          + New Backtest
        </button>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Symbol</th>
              <th className="px-4 py-3 text-left">TF</th>
              <th className="px-4 py-3 text-left">PnL</th>
              <th className="px-4 py-3 text-left">Return %</th>
              <th className="px-4 py-3 text-left">Trades</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-500">
                  Loading...
                </td>
              </tr>
            )}

            {!loading &&
              displayedBacktests.map((bt) => {
                const pnl = Number(bt.total_return_usdt || 0);
                const returnPct = Number(bt.total_return_percent || 0);

                return (
                  <tr
                    key={bt.id}
                    onClick={() => navigate(`/backtest/${bt.id}`)}
                    className="border-t border-slate-700 hover:bg-slate-900 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-white">
                      {bt.symbol}
                      <div className="text-xs text-slate-500">
                        {bt.timeframe}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-400">{bt.timeframe}</td>

                    <td
                      className={`px-4 py-3 font-medium ${
                        pnl >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {pnl.toFixed(2)}
                    </td>

                    <td
                      className={`px-4 py-3 ${
                        returnPct >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {returnPct.toFixed(2)}%
                    </td>

                    <td className="px-4 py-3 text-slate-400">
                      {bt.total_trades ?? 0}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          bt.status === "COMPLETED"
                            ? "bg-green-900 text-green-400"
                            : bt.status === "RUNNING"
                            ? "bg-yellow-900 text-yellow-400"
                            : bt.status === "FAILED"
                            ? "bg-red-900 text-red-400"
                            : "bg-slate-700 text-slate-400"
                        }`}
                      >
                        {bt.status}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-500">
                      {new Date(bt.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}

            {!loading && displayedBacktests.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-500">
                  No backtests yet. Click “New Backtest”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
