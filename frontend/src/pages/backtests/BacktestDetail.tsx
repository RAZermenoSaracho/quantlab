import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import EquityCurveChart from "../../components/charts/EquityCurveChart";
import CandlestickChart from "../../components/charts/CandlestickChart";
import { StatusBadge } from "../../components/ui/StatusBadge";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import KpiCard from "../../components/ui/KpiCard";
import Button from "../../components/ui/Button";
import { exportStructuredBacktestPdf } from "../../utils/exportBacktestPdf";

import ListView, { type ListColumn } from "../../components/ui/ListView";
import {
  useBacktest,
  useBacktests,
  useDeleteBacktestMutation,
  useRerunBacktestMutation,
} from "../../data/backtests";

import type {
  BacktestTrade,
  EquityPoint,
  BacktestRun,
  BacktestAnalysis,
} from "@quantlab/contracts";
import { formatDateTime } from "../../utils/date";

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
  equityRaw: EquityPoint[],
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

function safeDate(x: unknown) {
  if (!x) return null;
  const d =
    x instanceof Date
      ? x
      : typeof x === "string" || typeof x === "number"
      ? new Date(x)
      : null;

  if (!d) return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

function periodDays(start: unknown, end: unknown) {
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

  const [loadingDelete, setLoadingDelete] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingRerun, setLoadingRerun] = useState(false);

  const [returnPeriod, setReturnPeriod] = useState<
    "yearly" | "monthly" | "weekly" | "daily"
  >("yearly");

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const { data, error: detailError } = useBacktest(id ?? "");
  const { data: allBacktests, error: listError } = useBacktests();
  const deleteMutation = useDeleteBacktestMutation();
  const rerunMutation = useRerunBacktestMutation();
  const allIds = useMemo(
    () => (allBacktests ?? []).map((backtest) => backtest.id),
    [allBacktests]
  );

  /* ================= SAFE DATA ================= */

  const run: BacktestRun | null = data?.run ?? null;
  const metrics = data?.metrics ?? {};
  const analysis: BacktestAnalysis | null = data?.analysis ?? null;
  const trades: BacktestTrade[] = data?.trades ?? [];

  const equity_curve_raw = data?.equity_curve ?? [];
  
  const candles = useMemo(
    () =>
      (data?.candles ?? []).map((c) => ({
        ...c,
        timestamp:
          typeof c.timestamp === "string"
            ? new Date(c.timestamp).getTime()
            : c.timestamp,
      })),
    [data?.candles]
  );

  const candlesCount = data?.candles_count ?? candles.length ?? 0;

  const openPositionsAtEnd = Number(data?.open_positions_at_end ?? 0);
  const hadForcedClose = Boolean(data?.had_forced_close ?? false);

  const forcedCloseCount = trades.filter((t) => t.forced_close).length;

  /* ================= DERIVED ================= */

  const equity_curve = useMemo(
    () =>
      equity_curve_raw.map((p) => ({
        timestamp:
          typeof p.timestamp === "string"
            ? new Date(p.timestamp).getTime()
            : p.timestamp,
        equity: Number(p.equity ?? 0),
      })),
    [equity_curve_raw]
  );

  const equity = useMemo(
    () => equity_curve.map((p) => Number(p.equity ?? 0)),
    [equity_curve]
  );

  const returns = useMemo(() => computeReturns(equity), [equity]);

  const derived = useMemo(() => {
    const initial = Number(run?.initial_balance ?? 0);
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
  }, [equity, returns, run?.initial_balance]);

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
    metrics?.sharpe_ratio ??
    derived.sharpe;

  const volatility =
    analysis?.risk?.volatility ?? metrics?.volatility ?? derived.volatility;

  const maxDD =
    analysis?.risk?.max_drawdown_pct ??
    metrics?.max_drawdown_percent ??
    derived.maxDD;

  const totalTrades = Number(metrics?.total_trades ?? trades.length ?? 0);
  const getTradeNetPnl = (trade: BacktestTrade) =>
    Number(trade.net_pnl ?? trade.pnl ?? 0);
  const getTradeGrossPnl = (trade: BacktestTrade) =>
    Number(trade.gross_pnl ?? getTradeNetPnl(trade));
  const getTradeEntryNotional = (trade: BacktestTrade) =>
    Number(
      trade.entry_notional ??
        Number(trade.entry_price ?? 0) * Number(trade.quantity ?? 0)
    );
  const getTradeExitNotional = (trade: BacktestTrade) =>
    trade.exit_notional != null
      ? Number(trade.exit_notional)
      : trade.exit_price != null
        ? Number(trade.exit_price) * Number(trade.quantity ?? 0)
        : null;
  const getTradeTotalFee = (trade: BacktestTrade) =>
    Number(
      trade.total_fee ??
        Number(trade.entry_fee ?? 0) +
          Number(trade.exit_fee ?? 0)
    );

  const winRate =
    Number(metrics?.win_rate_percent ?? 0) ||
    (trades.length
      ? (trades.filter((t) => getTradeNetPnl(t) > 0).length / trades.length) *
        100
      : 0);

  const wins = useMemo(
    () => trades.filter((t) => getTradeNetPnl(t) > 0),
    [trades]
  );

  const losses = useMemo(
    () => trades.filter((t) => getTradeNetPnl(t) < 0),
    [trades]
  );

  const avgWin = mean(wins.map((t) => getTradeNetPnl(t)));
  const avgLoss = mean(losses.map((t) => getTradeNetPnl(t)));

  const expectancy = trades.length ? Number(netProfit ?? 0) / trades.length : 0;

  const rr = Math.abs(avgLoss) ? avgWin / Math.abs(avgLoss) : 0;

  const days = periodDays(run?.start_date, run?.end_date);

  const periodReturns = useMemo(
    () => groupReturns(equity_curve, returnPeriod),
    [equity_curve, returnPeriod]
  );

  const avgPeriodReturn = mean(periodReturns.map((p) => p.returnPct));

  const specificReturn = selectedPeriod
    ? periodReturns.find((p) => p.period === selectedPeriod)?.returnPct ?? null
    : null;

  /* ================= TRADE TABLE ================= */

  const tradeColumns: ListColumn<BacktestTrade>[] = useMemo(
    () => [
      {
        key: "side",
        header: "Side",
        render: (t) => (
          <span className="flex items-center gap-2">
            {t.side}
            {t.forced_close && (
              <span className="text-xs bg-amber-700 text-white px-2 py-0.5 rounded">
                Forced
              </span>
            )}
          </span>
        ),
      },

      {
        key: "quantity",
        header: "Qty",
        render: (t) => Number(t.quantity ?? 0).toFixed(4),
      },

      {
        key: "entry",
        header: "Entry",
        render: (t) => Number(t.entry_price ?? 0).toFixed(2),
      },

      {
        key: "exit",
        header: "Exit",
        render: (t) =>
          t.exit_price != null ? Number(t.exit_price).toFixed(2) : "-",
      },

      {
        key: "entry_notional",
        header: "Entry Value",
        render: (t) => getTradeEntryNotional(t).toFixed(2),
      },

      {
        key: "exit_notional",
        header: "Exit Value",
        render: (t) => {
          const exitNotional = getTradeExitNotional(t);
          return exitNotional != null ? exitNotional.toFixed(2) : "-";
        },
      },

      {
        key: "entry_fee",
        header: "Entry Fee",
        render: (t) => Number(t.entry_fee ?? 0).toFixed(4),
      },

      {
        key: "exit_fee",
        header: "Exit Fee",
        render: (t) =>
          t.exit_fee != null ? Number(t.exit_fee).toFixed(4) : "-",
      },

      {
        key: "total_fee",
        header: "Total Fee",
        render: (t) => getTradeTotalFee(t).toFixed(4),
      },

      {
        key: "gross_pnl",
        header: "Gross PnL",
        render: (t) => {
          const grossPnl = getTradeGrossPnl(t);
          return (
            <span className={grossPnl >= 0 ? "text-emerald-300" : "text-red-300"}>
              {grossPnl.toFixed(2)}
            </span>
          );
        },
      },

      {
        key: "opened",
        header: "Opened",
        render: (t) => formatDateTime(t.opened_at),
      },

      {
        key: "closed",
        header: "Closed",
        render: (t) => formatDateTime(t.closed_at),
      },

      {
        key: "net_pnl",
        header: "Net PnL",
        render: (t) => {
          const pnl = getTradeNetPnl(t);

          return (
            <span
              className={
                pnl >= 0
                  ? "text-emerald-400 font-semibold"
                  : "text-red-400 font-semibold"
              }
            >
              {pnl.toFixed(2)}
            </span>
          );
        },
      },

      {
        key: "pnl_percent",
        header: "PnL %",
        render: (t) => {
          const pct = Number(t.pnl_percent ?? 0);

          return (
            <span
              className={
                pct >= 0
                  ? "text-emerald-300"
                  : "text-red-300"
              }
            >
              {pct ? `${pct.toFixed(2)}%` : "-"}
            </span>
          );
        },
      },
    ],
    []
  );

  /* ================= ACTIONS ================= */

  async function handleDelete() {
    if (!confirm("Delete backtest?")) return;

    setLoadingDelete(true);

    try {
      await deleteMutation.mutate(id!);
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
    } finally {
      setLoadingPdf(false);
    }
  }

  async function handleRerun() {
    if (!id) return;

    try {
      setLoadingRerun(true);
      const result = await rerunMutation.mutate(id);
      navigate(`/backtests/${result.id}`);
    } finally {
      setLoadingRerun(false);
    }
  }

  /* ================= UI ================= */

  if (detailError || listError) {
    return <div className="p-6 text-red-400">{detailError || listError}</div>;
  }

  if (!data || !run)
    return <div className="p-6 text-slate-400">Loading...</div>;

  return (
    <div id="backtest-report" className="w-full min-w-0 max-w-full space-y-8">

      {/* HEADER */}

      <div className="w-full min-w-0 max-w-full flex justify-between items-start">

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
            {formatDateTime(run.start_date)} → {formatDateTime(run.end_date)}
          </p>

          <p className="text-slate-500 text-xs mt-1">
            Exchange: {run.exchange ?? "binance"} • Fee:{" "}
            {run.fee_rate != null ? Number(run.fee_rate).toFixed(4) : "—"} •{" "}
            {days != null ? `Period: ${days} days` : "Period: —"}
          </p>

        </div>

        <div className="flex gap-3 items-center">

          <DetailNavigator
            ids={allIds}
            currentId={id!}
            basePath="/backtests"
          />

          <StatusBadge status={run.status} />

          <Button
            variant="PRIMARY"
            size="md"
            loading={loadingPdf}
            loadingText="Generating..."
            onClick={handleExportPdf}
          >
            Export PDF
          </Button>

          <Button
            variant="WARNING"
            size="md"
            loading={loadingRerun}
            loadingText="Starting..."
            onClick={handleRerun}
          >
            Re-run Backtest
          </Button>

          <Button
            variant="DELETE"
            size="md"
            loading={loadingDelete}
            loadingText="Deleting..."
            onClick={handleDelete}
          >
            Delete
          </Button>

        </div>

      </div>

      {/* WARNING */}

      {hadForcedClose && (
        <div className="bg-amber-900/40 border border-amber-600 text-amber-300 px-4 py-3 rounded-lg text-sm">
          ⚠ Strategy ended with <strong>{openPositionsAtEnd}</strong> open
          position{openPositionsAtEnd > 1 ? "s" : ""}. They were automatically
          closed at the last candle for reporting purposes.
        </div>
      )}

      {/* CORE METRICS */}
      <div className="w-full min-w-0 max-w-full grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-5">
        <KpiCard
          title="Net Profit"
          value={Number(netProfit ?? 0)}
          positive={Number(netProfit ?? 0) >= 0}
          format={(v) => `${fmtMoney(v)} USDT`}
          size="compact"
        />

        <KpiCard
          title="Return"
          value={Number(retPct ?? 0)}
          positive={Number(retPct ?? 0) >= 0}
          format={(v) => fmtPct(v)}
          size="compact"
        />

        <KpiCard
          title="Sharpe"
          value={Number(sharpe ?? 0)}
          format={(v) => v.toFixed(2)}
          size="compact"
        />

        <KpiCard
          title="Volatility"
          value={Number(volatility ?? 0) * 100}
          format={(v) => fmtPct(v)}
          size="compact"
        />

        <KpiCard
          title="Max Drawdown"
          value={Number(maxDD ?? 0)}
          positive={Number(maxDD ?? 0) < 20}
          format={(v) => fmtPct(v)}
          size="compact"
        />
        {forcedCloseCount > 0 && (
          <KpiCard
            title="Forced Closures"
            value={forcedCloseCount}
            positive={false}
            size="compact"
          />
        )}
      </div>

      {/* RUN META + TRADE QUALITY */}
      <div className="w-full min-w-0 max-w-full grid grid-cols-2 md:grid-cols-6 gap-4">
        <KpiCard
          title="Initial Balance"
          value={Number(derived.initial ?? run.initial_balance ?? 0)}
          format={(v) => `${fmtMoney(v)} USDT`}
          size="compact"
        />

        <KpiCard
          title="Final Balance"
          value={Number(derived.final ?? 0)}
          positive={Number(derived.final ?? 0) >= Number(derived.initial ?? 0)}
          format={(v) => `${fmtMoney(v)} USDT`}
          size="compact"
        />

        <KpiCard
          title="Total Trades"
          value={totalTrades}
          size="compact"
        />

        <KpiCard
          title="Win Rate"
          value={winRate}
          positive={winRate >= 50}
          format={(v) => fmtPct(v)}
          size="compact"
        />

        <KpiCard
          title="Candles"
          value={candlesCount}
          size="compact"
        />

        <KpiCard
          title="Expectancy"
          value={expectancy}
          positive={expectancy >= 0}
          format={(v) => `${fmtMoney(v)} USDT`}
          size="compact"
        />
      </div>

      <div className="w-full min-w-0 max-w-full grid grid-cols-2 md:grid-cols-4 gap-5">

        <KpiCard
          title="Avg Win"
          value={avgWin}
          positive={avgWin >= 0}
          format={(v) => `${fmtMoney(v, 2)} USDT`}
          size="compact"
        />

        <KpiCard
          title="Avg Loss"
          value={avgLoss}
          positive={avgLoss >= 0}
          format={(v) => `${fmtMoney(v, 2)} USDT`}
          size="compact"
        />

        <KpiCard
          title="Risk/Reward"
          value={rr}
          positive={rr >= 1}
          format={(v) => v.toFixed(2)}
          size="compact"
        />

        <KpiCard
          title="Profit Factor"
          value={Number(metrics?.profit_factor ?? 0)}
          positive={Number(metrics?.profit_factor ?? 0) >= 1}
          format={(v) => v.toFixed(2)}
          size="compact"
        />

      </div>

      {/* PRICE CHART */}
      <div id="candle-chart-wrapper" className="w-full min-w-0 max-w-full bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Price Chart (Candles + Trades)</h3>
          <span className="text-xs text-slate-400">
            Candles: {candlesCount} • Trades: {trades.length}
          </span>
        </div>

        <CandlestickChart candles={candles} trades={trades} />
      </div>

      {/* PERIOD ANALYSIS */}
      <div className="w-full min-w-0 max-w-full bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-white font-semibold">Period Analysis</h3>

          <select
            value={returnPeriod}
            onChange={(e) => {
              setSelectedPeriod(null);
              setReturnPeriod(
                e.target.value as "yearly" | "monthly" | "weekly" | "daily"
              );
            }}
            className="bg-slate-900 text-white px-3 py-1 rounded"
          >
            <option value="yearly">Yearly</option>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </div>

        <KpiCard
          title={`Avg ${returnPeriod} Return`}
          value={avgPeriodReturn}
          positive={avgPeriodReturn >= 0}
          format={(v) => fmtPct(v)}
          size="compact"
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
          <KpiCard
            title="Selected Period"
            value={specificReturn}
            positive={specificReturn >= 0}
            format={(v) => fmtPct(v)}
            size="compact"
          />
        )}
      </div>

      {/* EQUITY CHART */}
      <div id="equity-chart-wrapper" className="w-full min-w-0 max-w-full bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-white font-semibold mb-4">Equity Curve</h3>
        <EquityCurveChart equity={equity_curve} />
      </div>

      {/* TRADES */}

      <div className="w-full min-w-0 overflow-x-auto">
        <ListView
          tableId="backtest_trades"
          title="Trades"
          description="Executed trades during the backtest"
          columns={tradeColumns}
          data={trades}
          emptyMessage="No trades generated for this run."
        />
      </div>

    </div>
  );
}
