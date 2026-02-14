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

export default function BacktestsList({
  limit,
  showTitle = true,
}: Props) {
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const data = await getAllBacktests();
        setBacktests(data.backtests || data);
      } catch (err) {
        console.error(err);
      }
    }

    load();
  }, []);

  const displayedBacktests = limit
    ? backtests.slice(0, limit)
    : backtests;

  return (
    <div className="space-y-6">
      {showTitle && (
        <h1 className="text-2xl font-bold text-white">
          Backtests
        </h1>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Symbol</th>
              <th className="px-4 py-3 text-left">TF</th>
              <th className="px-4 py-3 text-left">Initial</th>
              <th className="px-4 py-3 text-left">PnL</th>
              <th className="px-4 py-3 text-left">Return %</th>
              <th className="px-4 py-3 text-left">Trades</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>

          <tbody>
            {displayedBacktests.map((bt) => {
              const pnl = Number(bt.total_return_usdt);
              const returnPct = Number(bt.total_return_percent);

              return (
                <tr
                  key={bt.id}
                  onClick={() => navigate(`/backtest/${bt.id}`)}
                  className="border-t border-slate-700 hover:bg-slate-900 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-white">
                    {bt.symbol}
                  </td>

                  <td className="px-4 py-3 text-slate-400">
                    {bt.timeframe}
                  </td>

                  <td className="px-4 py-3 text-slate-400">
                    {Number(bt.initial_balance).toFixed(2)}
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

                  <td
                    className={`px-4 py-3 ${
                      returnPct >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {returnPct.toFixed(2)}%
                  </td>

                  <td className="px-4 py-3 text-slate-400">
                    {bt.total_trades}
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
                    {new Date(
                      bt.created_at
                    ).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}

            {displayedBacktests.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-6 text-slate-500"
                >
                  No backtests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
