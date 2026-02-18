// frontend/src/pages/backtests/BacktestDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getBacktest,
  deleteBacktest,
  getAllBacktests,
} from "../../services/backtest.service";
import EquityCurveChart from "../../components/charts/EquityCurveChart";
import { StatusBadge } from "../../components/ui/StatusBadge";
import DetailNavigator from "../../components/navigation/DetailNavigator";

type BacktestDetailPayload = {
  run: any;
  metrics?: any;
  analysis?: any;
  trades: any[];
  equity_curve: any[];
};

/* ===========================
   UTILITIES
=========================== */

function fmtMoney(x: number, decimals = 2) {
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(decimals);
}

function fmtPct(x: number, decimals = 2) {
  if (!Number.isFinite(x)) return "0.00%";
  return `${x.toFixed(decimals)}%`;
}

function parseEquitySeries(equityCurve: any[]): number[] {
  if (!Array.isArray(equityCurve)) return [];
  if (!equityCurve.length) return [];

  // legacy number[]
  if (typeof equityCurve[0] === "number") {
    return equityCurve.map((n) => Number(n) || 0);
  }

  // object series [{timestamp, equity}]
  return equityCurve.map((p: any) => Number(p?.equity ?? 0) || 0);
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, x) => a + (x - m) ** 2, 0) / arr.length);
}

function computeReturns(equity: number[]) {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1];
    const cur = equity[i];
    out.push(prev ? cur / prev - 1 : 0);
  }
  return out;
}

function computeDrawdown(equity: number[]) {
  if (!equity.length) return { series: [] as number[], maxDD: 0 };

  let peak = equity[0] || 0;
  let maxDD = 0;
  const series: number[] = [];

  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = peak ? (e - peak) / peak : 0; // <= 0
    series.push(dd);
    maxDD = Math.max(maxDD, -dd);
  }

  return { series: series.map((d) => d * 100), maxDD: maxDD * 100 };
}

/* ===========================
   COMPONENT
=========================== */

export default function BacktestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [allIds, setAllIds] = useState<string[]>([]);
  const [data, setData] = useState<BacktestDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDelete, setLoadingDelete] = useState(false);

  /* ---------------------------
     LOAD DATA
  --------------------------- */
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

  /* ---------------------------
     SAFE FALLBACKS (no hooks here)
  --------------------------- */
  const run = data?.run ?? {};
  const metrics = data?.metrics ?? {};
  const analysis = data?.analysis ?? {};
  const trades = data?.trades ?? [];
  const equityRaw = data?.equity_curve ?? [];

  /* ---------------------------
     DERIVED VALUES (hooks MUST run always)
  --------------------------- */
  const equity = useMemo(() => parseEquitySeries(equityRaw), [equityRaw]);

  const derived = useMemo(() => {
    const initial = Number(run.initial_balance ?? metrics.initial_balance ?? 0) || 0;
    const final = equity.length ? equity[equity.length - 1] : Number(metrics.final_balance ?? initial) || initial;

    const netProfit = final - initial;
    const retPct = initial ? (netProfit / initial) * 100 : 0;

    const returns = computeReturns(equity);
    const vol = std(returns);
    const sharpe = vol ? mean(returns) / vol : 0;

    const dd = computeDrawdown(equity);

    return {
      initial,
      final,
      netProfit,
      retPct,
      sharpe,
      volatility: vol,
      maxDD: dd.maxDD,
      ddSeries: dd.series,
    };
  }, [run, metrics, equity]);

  /* ---------------------------
     DELETE
  --------------------------- */
  async function handleDelete() {
    if (!id) return;

    const confirmDelete = confirm("Are you sure you want to delete this backtest?");
    if (!confirmDelete) return;

    setLoadingDelete(true);
    try {
      await deleteBacktest(id);

      const index = allIds.indexOf(id);
      const nextId = allIds[index + 1] || allIds[index - 1] || null;

      if (nextId) navigate(`/backtest/${nextId}`);
      else navigate("/backtests");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to delete backtest");
    } finally {
      setLoadingDelete(false);
    }
  }

  /* ---------------------------
     NOW safe to conditional render
  --------------------------- */
  if (error) return <div className="p-6 text-red-400">{error}</div>;
  if (!data) return <div className="p-6 text-slate-400">Loading...</div>;

  // Prefer backend analysis if present
  const netProfit = Number(analysis?.summary?.net_profit ?? derived.netProfit ?? metrics.total_return_usdt ?? 0);
  const retPct = Number(analysis?.summary?.return_pct ?? derived.retPct ?? metrics.total_return_percent ?? 0);
  const sharpe = Number(analysis?.risk?.sharpe ?? derived.sharpe ?? 0);
  const volatility = Number(analysis?.risk?.volatility ?? derived.volatility ?? 0);
  const maxDD = Number(analysis?.risk?.max_drawdown_pct ?? derived.maxDD ?? metrics.max_drawdown_percent ?? 0);

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-start gap-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {run.symbol} — {run.timeframe}
          </h1>

          <p className="text-slate-400 text-sm mt-1">
            {run.start_date?.slice(0, 10)} → {run.end_date?.slice(0, 10)}
          </p>

          <div className="mt-3 space-y-1 text-xs">
            <p className="text-slate-500">
              Initial balance:{" "}
              <span className="text-slate-300 font-medium">
                {fmtMoney(Number(run.initial_balance || 0), 2)} USDT
              </span>
            </p>

            <p className="text-slate-500">
              Final balance:{" "}
              <span
                className={`font-semibold ${
                  derived.final >= Number(run.initial_balance || 0)
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {fmtMoney(derived.final, 2)} USDT
              </span>
            </p>
          </div>
        </div>


        <div className="flex items-center gap-4">
          <DetailNavigator ids={allIds} currentId={id!} basePath="/backtest" />
          <StatusBadge status={run.status} />

          <button
            onClick={handleDelete}
            disabled={loadingDelete}
            className="bg-red-600 hover:bg-red-700 transition-colors px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50"
          >
            {loadingDelete ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {/* OVERVIEW */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard title="Net Profit" value={`${fmtMoney(netProfit)} USDT`} positive={netProfit >= 0} />
        <MetricCard title="Return" value={fmtPct(retPct)} positive={retPct >= 0} />
        <MetricCard title="Sharpe" value={fmtMoney(sharpe, 2)} />
        <MetricCard title="Volatility" value={fmtPct(volatility * 100)} />
        <MetricCard title="Max Drawdown" value={fmtPct(maxDD)} />
      </div>

      {/* EQUITY */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4">Equity Curve</h3>
        <EquityCurveChart equity={equityRaw} />
      </div>

      {/* TRADES */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Side</th>
              <th className="px-4 py-3 text-left">Qty</th>
              <th className="px-4 py-3 text-left">Entry</th>
              <th className="px-4 py-3 text-left">Exit</th>
              <th className="px-4 py-3 text-left">Opened</th>
              <th className="px-4 py-3 text-left">Closed</th>
              <th className="px-4 py-3 text-left">PnL</th>
              <th className="px-4 py-3 text-left">PnL %</th>
            </tr>
          </thead>

          <tbody>
            {trades.map((t: any, i: number) => {
              const pnl = Number(t.pnl ?? t.net_pnl ?? 0) || 0;
              const pnlPct = Number(t.pnl_percent ?? t.pnlPercent ?? 0) || 0;
              const qty = Number(t.quantity ?? t.qty ?? 0) || 0;

              const side = (t.side || "").toString().toUpperCase();
              const openedAt = t.opened_at ? String(t.opened_at).slice(0, 19).replace("T", " ") : "-";
              const closedAt = t.closed_at ? String(t.closed_at).slice(0, 19).replace("T", " ") : "-";

              return (
                <tr key={t.id || i} className="border-t border-slate-700 hover:bg-slate-900">
                  <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      side === "BUY" || side === "LONG" ? "text-green-300" : "text-red-300"
                    }`}
                  >
                    {side || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{qty ? qty.toFixed(4) : "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{Number(t.entry_price || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {t.exit_price != null ? Number(t.exit_price).toFixed(2) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{openedAt}</td>
                  <td className="px-4 py-3 text-slate-400">{closedAt}</td>
                  <td className={`px-4 py-3 font-semibold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {pnl.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 font-medium ${pnlPct >= 0 ? "text-green-300" : "text-red-300"}`}>
                    {pnlPct ? `${pnlPct.toFixed(2)}%` : "-"}
                  </td>
                </tr>
              );
            })}

            {trades.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={9}>
                  No trades available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===========================
   SMALL COMPONENTS
=========================== */

function MetricCard({
  title,
  value,
  positive,
}: {
  title: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-slate-400 text-xs uppercase">{title}</p>
      <p
        className={`mt-2 text-lg font-semibold ${
          positive === undefined ? "text-white" : positive ? "text-green-400" : "text-red-400"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
