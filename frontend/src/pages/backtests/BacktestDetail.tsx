import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getBacktest,
  deleteBacktest,
  getAllBacktests,
} from "../../services/backtest.service";

import EquityCurveChart from "../../components/charts/EquityCurveChart";
import CandlestickChart from "../../components/charts/CandlestickChart";
import { StatusBadge } from "../../components/ui/StatusBadge";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import KpiCard from "../../components/ui/KpiCard";
import MetricCard from "../../components/ui/MetricCard";
import { exportStructuredBacktestPdf } from "../../utils/exportBacktestPdf";

type BacktestDetailPayload = {
  run: any;
  metrics?: any;
  analysis?: any;
  trades: any[];
  equity_curve: any[];
  candles?: any[];
  candles_count?: number;
  candles_start_ts?: number;
  candles_end_ts?: number;
  open_positions_at_end?: number;
  had_forced_close?: boolean;
};

/* ================= UTILITIES ================= */

function fmtMoney(x: number, d = 2) {
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(d);
}

function fmtPct(x: number, d = 2) {
  if (!Number.isFinite(x)) return "0.00%";
  return `${x.toFixed(d)}%`;
}

function mean(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function std(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, x) => a + (x - m) ** 2, 0) / arr.length);
}

function computeReturns(equity: number[]) {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    out.push(equity[i - 1] ? equity[i] / equity[i - 1] - 1 : 0);
  }
  return out;
}

function computeDrawdown(equity: number[]) {
  if (!equity.length) return 0;
  let peak = equity[0];
  let maxDD = 0;

  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = peak ? (e - peak) / peak : 0;
    maxDD = Math.max(maxDD, -dd);
  }

  return maxDD * 100;
}

function groupReturns(
  equityRaw: any[],
  period: "yearly" | "monthly" | "weekly" | "daily"
) {
  const grouped: Record<string, number[]> = {};

  for (const p of equityRaw) {
    if (!p.timestamp) continue;

    const date = new Date(p.timestamp);
    let key = "";

    if (period === "yearly") key = `${date.getFullYear()}`;

    if (period === "monthly")
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}`;

    if (period === "weekly") {
      const d = new Date(date);
      d.setDate(date.getDate() - date.getDay());
      key = d.toISOString().slice(0, 10);
    }

    if (period === "daily") key = date.toISOString().slice(0, 10);

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(Number(p.equity ?? 0));
  }

  return Object.entries(grouped)
    .map(([k, values]) => {
      if (values.length < 2) return null;
      const first = values[0];
      const last = values[values.length - 1];
      const ret = first ? ((last - first) / first) * 100 : 0;
      return { period: k, returnPct: ret };
    })
    .filter(Boolean) as { period: string; returnPct: number }[];
}

function safeDate(x: any) {
  if (!x) return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d;
}

function periodDays(start: any, end: any) {
  const s = safeDate(start);
  const e = safeDate(end);
  if (!s || !e) return null;
  const ms = e.getTime() - s.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/* ================= COMPONENT ================= */

export default function BacktestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<BacktestDetailPayload | null>(null);
  const [allIds, setAllIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [returnPeriod, setReturnPeriod] = useState<
    "yearly" | "monthly" | "weekly" | "daily"
  >("yearly");

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    async function load() {
      if (!id) return;

      const detail = await getBacktest(id);
      setData(detail);

      const list = await getAllBacktests();
      setAllIds(list.backtests.map((b: any) => b.id));
    }

    load().catch(() => setError("Failed to load backtest"));
  }, [id]);

  /* ================= SAFE FALLBACK DATA ================= */

  const run = data?.run ?? {};
  const metrics = data?.metrics ?? {};
  const analysis = data?.analysis ?? {};
  const trades = data?.trades ?? [];

  const openPositionsAtEnd = Number(data?.open_positions_at_end ?? 0);
  const hadForcedClose = Boolean(data?.had_forced_close ?? false);

  const forcedCloseCount = trades.filter(
    (t: any) => t.forced_close === true
  ).length;

  const equity_curve = data?.equity_curve ?? [];
  const candles = data?.candles ?? [];
  const candlesCount = data?.candles_count ?? candles.length ?? 0;

  /* ================= DERIVED DATA ================= */

  const equity = useMemo(
    () => equity_curve.map((p: any) => Number(p.equity ?? 0)),
    [equity_curve]
  );

  const returns = useMemo(() => computeReturns(equity), [equity]);

  const derived = useMemo(() => {
    const initial = Number(run.initial_balance ?? 0);
    const final = equity[equity.length - 1] ?? initial;

    const netProfit = final - initial;
    const retPct = initial ? (netProfit / initial) * 100 : 0;

    const vol = std(returns);
    const sharpe = vol ? mean(returns) / vol : 0;

    return {
      initial,
      final,
      netProfit,
      retPct,
      sharpe,
      volatility: vol,
      maxDD: computeDrawdown(equity),
    };
  }, [equity, returns, run.initial_balance]);

  const netProfit =
    analysis?.summary?.net_profit ??
    metrics?.total_return_usdt ??
    derived.netProfit;

  const retPct =
    analysis?.summary?.return_pct ??
    metrics?.total_return_percent ??
    derived.retPct;

  const sharpe =
    analysis?.risk?.sharpe ??
    metrics?.sharpe_ratio ?? // your DB uses sharpe_ratio
    derived.sharpe;

  const volatility =
    analysis?.risk?.volatility ?? metrics?.volatility ?? derived.volatility;

  const maxDD =
    analysis?.risk?.max_drawdown_pct ??
    metrics?.max_drawdown_percent ??
    derived.maxDD;

  const totalTrades = Number(metrics?.total_trades ?? trades.length ?? 0);
  const winRate =
    Number(metrics?.win_rate_percent ?? 0) ||
    (trades.length
      ? (trades.filter((t: any) => Number(t.pnl ?? 0) > 0).length / trades.length) *
        100
      : 0);

  const wins = useMemo(
    () => trades.filter((t: any) => Number(t.pnl ?? 0) > 0),
    [trades]
  );
  const losses = useMemo(
    () => trades.filter((t: any) => Number(t.pnl ?? 0) < 0),
    [trades]
  );

  const avgWin = useMemo(
    () => mean(wins.map((t: any) => Number(t.pnl ?? 0))),
    [wins]
  );
  const avgLoss = useMemo(
    () => mean(losses.map((t: any) => Number(t.pnl ?? 0))),
    [losses]
  );

  const expectancy = useMemo(() => {
    const n = trades.length;
    if (!n) return 0;
    return Number(netProfit ?? 0) / n;
  }, [netProfit, trades.length]);

  const rr = useMemo(() => {
    const l = Math.abs(avgLoss);
    return l ? avgWin / l : 0;
  }, [avgWin, avgLoss]);

  const days = periodDays(run.start_date, run.end_date);

  const periodReturns = useMemo(
    () => groupReturns(equity_curve, returnPeriod),
    [equity_curve, returnPeriod]
  );

  const avgPeriodReturn = mean(periodReturns.map((p) => p.returnPct));

  const specificReturn = selectedPeriod
    ? periodReturns.find((p) => p.period === selectedPeriod)?.returnPct ?? null
    : null;

  /* ================= ACTIONS ================= */

  async function handleDelete() {
    if (!confirm("Delete backtest?")) return;

    setLoadingDelete(true);
    try {
      await deleteBacktest(id!);
      navigate("/backtests");
    } finally {
      setLoadingDelete(false);
    }
  }

  async function handleExportPdf() {
    try {
      setLoadingPdf(true);

      await exportStructuredBacktestPdf({
        run,
        metrics,
        trades,
      });

    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPdf(false);
    }
  }

  /* ================= CONDITIONAL UI ================= */

  if (error) {
    return <div className="p-6 text-red-400">{error}</div>;
  }

  if (!data) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  /* ================= UI ================= */

  return (
    <div id="backtest-report" className="space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {run.symbol} — {run.timeframe}
          </h1>

          <p className="text-slate-400 text-sm mt-1">
            Strategy:{" "}
            <button
              onClick={() => navigate(`/algorithms/${run.algorithm_id}`)}
              className="text-sky-400 hover:text-sky-300 font-medium transition-colors"
            >
              {run.algorithm_name ?? "—"}
            </button>
          </p>

          <p className="text-slate-500 text-xs">
            {run.start_date?.slice(0, 10)} → {run.end_date?.slice(0, 10)}
          </p>

          <p className="text-slate-500 text-xs mt-1">
            Exchange: {run.exchange ?? "binance"} • Fee:{" "}
            {run.fee_rate != null ? Number(run.fee_rate).toFixed(4) : "—"} •{" "}
            {days != null ? `Period: ${days} days` : "Period: —"}
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <DetailNavigator ids={allIds} currentId={id!} basePath="/backtest" />
          <StatusBadge status={run.status} />

          <button
            onClick={handleExportPdf}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white"
            disabled={loadingPdf}
            title="Export current report view"
          >
            {loadingPdf ? "Generating..." : "Export PDF"}
          </button>

          <button
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white"
            disabled={loadingDelete}
          >
            {loadingDelete ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      {hadForcedClose && (
        <div className="bg-amber-900/40 border border-amber-600 text-amber-300 px-4 py-3 rounded-lg text-sm">
          ⚠ Strategy ended with <strong>{openPositionsAtEnd}</strong> open position
          {openPositionsAtEnd > 1 ? "s" : ""}.  
          They were automatically closed at the last candle for reporting purposes.
        </div>
      )}

      {/* CORE METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          title="Net Profit"
          value={`${fmtMoney(Number(netProfit ?? 0))} USDT`}
          positive={Number(netProfit ?? 0) >= 0}
        />
        <KpiCard title="Return" value={fmtPct(Number(retPct ?? 0))} positive={Number(retPct ?? 0) >= 0} />
        <KpiCard title="Sharpe" value={fmtMoney(Number(sharpe ?? 0), 2)} />
        <KpiCard title="Volatility" value={fmtPct(Number(volatility ?? 0) * 100)} />
        <KpiCard title="Max Drawdown" value={fmtPct(Number(maxDD ?? 0))} />
        {forcedCloseCount > 0 && (
          <KpiCard
            title="Forced Closures"
            value={String(forcedCloseCount)}
            positive={false}
          />
        )}
      </div>

      {/* RUN META + TRADE QUALITY */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <KpiCard
          title="Initial Balance"
          value={`${fmtMoney(Number(derived.initial ?? run.initial_balance ?? 0))} USDT`}
        />
        <KpiCard
          title="Final Balance"
          value={`${fmtMoney(Number(derived.final ?? 0))} USDT`}
          positive={Number(derived.final ?? 0) >= Number(derived.initial ?? 0)}
        />
        <KpiCard title="Total Trades" value={String(totalTrades)} />
        <KpiCard title="Win Rate" value={fmtPct(winRate)} positive={winRate >= 50} />
        <KpiCard title="Candles" value={String(candlesCount)} />
        <KpiCard title="Expectancy" value={`${fmtMoney(expectancy, 2)} USDT`} positive={expectancy >= 0} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Avg Win" value={`${fmtMoney(avgWin, 2)} USDT`} positive={avgWin >= 0} />
        <MetricCard title="Avg Loss" value={`${fmtMoney(avgLoss, 2)} USDT`} positive={avgLoss >= 0} />
        <MetricCard title="Risk/Reward" value={fmtMoney(rr, 2)} positive={rr >= 1} />
        <MetricCard
          title="Profit Factor"
          value={fmtMoney(Number(metrics?.profit_factor ?? 0), 2)}
          positive={Number(metrics?.profit_factor ?? 0) >= 1}
        />
      </div>

      {/* PRICE CHART */}
      <div id="candle-chart-wrapper" className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Price Chart (Candles + Trades)</h3>
          <span className="text-xs text-slate-400">
            Candles: {candlesCount} • Trades: {trades.length}
          </span>
        </div>

        <CandlestickChart candles={candles} trades={trades} />
      </div>

      {/* PERIOD ANALYSIS */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-white font-semibold">Period Analysis</h3>

          <select
            value={returnPeriod}
            onChange={(e) => {
              setSelectedPeriod(null);
              setReturnPeriod(e.target.value as any);
            }}
            className="bg-slate-900 text-white px-3 py-1 rounded"
          >
            <option value="yearly">Yearly</option>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </div>

        <MetricCard
          title={`Average ${returnPeriod} Return`}
          value={fmtPct(avgPeriodReturn)}
          positive={avgPeriodReturn >= 0}
        />

        <select
          value={selectedPeriod ?? ""}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="bg-slate-900 text-white px-3 py-1 rounded"
        >
          <option value="">Select specific period</option>
          {periodReturns.map((p) => (
            <option key={p.period} value={p.period}>
              {p.period}
            </option>
          ))}
        </select>

        {specificReturn != null && (
          <MetricCard
            title="Selected Period Return"
            value={fmtPct(specificReturn)}
            positive={specificReturn >= 0}
          />
        )}
      </div>

      {/* EQUITY CHART */}
      <div id="equity-chart-wrapper" className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-white font-semibold mb-4">Equity Curve</h3>
        <EquityCurveChart equity={equity_curve} />
      </div>

      {/* TRADES TABLE */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-900 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Trades</h3>
          <span className="text-xs text-slate-400">{trades.length} total</span>
        </div>

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
              const pnl = Number(t.pnl ?? t.net_pnl ?? 0);
              const pnlPct = Number(t.pnl_percent ?? 0);

              return (
                <tr
                  key={i}
                  className="border-t border-slate-700 hover:bg-slate-900"
                >
                  <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    {t.side}
                    {t.forced_close && (
                      <span className="text-xs bg-amber-700 text-white px-2 py-0.5 rounded">
                        Forced
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{Number(t.quantity ?? 0).toFixed(4)}</td>
                  <td className="px-4 py-3">{Number(t.entry_price ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    {t.exit_price != null ? Number(t.exit_price).toFixed(2) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {t.opened_at?.slice(0, 19)?.replace("T", " ") ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {t.closed_at?.slice(0, 19)?.replace("T", " ") ?? "-"}
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      pnl >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {pnl.toFixed(2)}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      pnlPct >= 0 ? "text-green-300" : "text-red-300"
                    }`}
                  >
                    {pnlPct ? `${pnlPct.toFixed(2)}%` : "-"}
                  </td>
                </tr>
              );
            })}

            {!trades.length && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                  No trades generated for this run.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
