import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllBacktests } from "../../services/backtest.service";
import type { BacktestRun } from "../../types/models";

type Props = {
  limit?: number;
  showTitle?: boolean;
};

export default function BacktestsList({ limit, showTitle = true }: Props) {
  const [backtests, setBacktests] = useState<BacktestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const data = await getAllBacktests();
        setBacktests(data.backtests);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const displayedBacktests = limit
    ? backtests.slice(0, limit)
    : backtests;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {showTitle && (
          <h1 className="text-2xl font-bold text-white">
            Backtests
          </h1>
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
              <th className="px-4 py-3 text-left">Timeframe</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-slate-500">
                  Loading...
                </td>
              </tr>
            )}

            {!loading &&
              displayedBacktests.map((bt) => (
                <tr
                  key={bt.id}
                  onClick={() =>
                    navigate(`/backtest/${bt.id}`)
                  }
                  className="border-t border-slate-700 hover:bg-slate-900 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-white">
                    {bt.symbol}
                  </td>

                  <td className="px-4 py-3 text-slate-400">
                    {bt.timeframe}
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
              ))}

            {!loading && displayedBacktests.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-slate-500">
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
