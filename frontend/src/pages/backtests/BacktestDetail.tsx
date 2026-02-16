import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getBacktest,
  deleteBacktest,
  getAllBacktests,
} from "../../services/backtest.service";
import EquityCurveChart from "../../components/charts/EquityCurveChart";
import { StatusBadge } from "../../components/ui/StatusBadge";
import DetailNavigator from "../../components/navigation/DetailNavigator";

export default function BacktestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [allIds, setAllIds] = useState<string[]>([]);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* ==============================
     LOAD DATA
  ============================== */
  useEffect(() => {
    async function load() {
      if (!id) return;

      const detail = await getBacktest(id);
      setData(detail);

      const list = await getAllBacktests();
      const ids = (list.backtests || list).map((b: any) => b.id);
      setAllIds(ids);
    }

    load().catch((err) => {
      console.error(err);
      setError("Failed to load backtest");
    });
  }, [id]);

  /* ==============================
     DELETE
  ============================== */
  async function handleDelete() {
    if (!id) return;

    const confirmDelete = confirm(
      "Are you sure you want to delete this backtest?"
    );
    if (!confirmDelete) return;

    setLoading(true);
    try {
      await deleteBacktest(id);

      // navigate to next available record
      const index = allIds.indexOf(id);
      const nextId =
        allIds[index + 1] ||
        allIds[index - 1] ||
        null;

      if (nextId) {
        navigate(`/backtest/${nextId}`);
      } else {
        navigate("/backtests");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ==============================
     STATES
  ============================== */
  if (error) return <div className="p-6 text-red-400">{error}</div>;
  if (!data) return <div className="p-6 text-slate-400">Loading...</div>;

  const { run, metrics, trades, equity_curve } = data;

  const totalReturn = Number(metrics?.total_return_usdt || 0);
  const totalReturnPct = Number(metrics?.total_return_percent || 0);
  const winRate = Number(metrics?.win_rate_percent || 0);
  const profitFactor = Number(metrics?.profit_factor || 0);
  const maxDrawdown = Number(metrics?.max_drawdown_percent || 0);

  /* ==============================
     RENDER
  ============================== */
  return (
    <div className="space-y-8">

      {/* HEADER */}
      <div className="flex justify-between items-start">

        <div>
          <h1 className="text-2xl font-bold text-white">
            {run.symbol} — {run.timeframe}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Period: {run.start_date?.slice(0, 10)} →{" "}
            {run.end_date?.slice(0, 10)}
          </p>
        </div>

        <div className="flex items-center gap-4">

          {/* 🔥 Navigator Component */}
          <DetailNavigator
            ids={allIds}
            currentId={id!}
            basePath="/backtest"
          />

          <StatusBadge status={run.status} />

          <button
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 transition-colors px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50"
          >
            Delete
          </button>

        </div>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Metric
          title="Total Return"
          value={`${totalReturn.toFixed(2)} USDT`}
          positive={totalReturn >= 0}
        />
        <Metric
          title="Return %"
          value={`${totalReturnPct.toFixed(2)}%`}
          positive={totalReturnPct >= 0}
        />
        <Metric
          title="Win Rate"
          value={`${winRate.toFixed(2)}%`}
          positive={winRate >= 50}
        />
        <Metric
          title="Profit Factor"
          value={profitFactor.toFixed(2)}
          positive={profitFactor >= 1}
        />
        <Metric
          title="Max Drawdown"
          value={`${maxDrawdown.toFixed(2)}%`}
        />
      </div>

      {/* EQUITY CURVE */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-4">
          Equity Curve
        </h2>
        <EquityCurveChart equity={equity_curve || []} />
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
            {trades.map((t: any, i: number) => {
              const pnl = Number(t.pnl || 0);

              return (
                <tr
                  key={i}
                  className="border-t border-slate-700 hover:bg-slate-900"
                >
                  <td className="px-4 py-3 text-slate-400">
                    {Number(t.entry_price).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {Number(t.exit_price).toFixed(2)}
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
          </tbody>
        </table>
      </div>

    </div>
  );
}

function Metric({ title, value, positive }: any) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-slate-400 text-xs uppercase">{title}</p>
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
