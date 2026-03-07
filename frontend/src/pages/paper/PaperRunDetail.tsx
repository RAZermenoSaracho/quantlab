import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import type {
  Candle,
  PaperTrade,
  PaperTick,
} from "@quantlab/contracts";
import CandlestickChart from "../../components/charts/CandlestickChart";
import EquityCurveChart from "../../components/charts/EquityCurveChart";
import StatusIndicator from "../../components/paper/StatusIndicator";
import Button from "../../components/ui/Button";
import KpiCard from "../../components/ui/KpiCard";
import { formatDateTime } from "../../utils/date";
import { usePaperRunEvents } from "../../hooks/usePaperRunEvents";
import {
  useDeletePaperRunMutation,
  usePaperRun,
  usePaperRuns,
  usePaperState,
  useStopPaperRunMutation,
} from "../../data/paper";
import { useCandles } from "../../data/market";

export default function PaperRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const runId = id ?? "";

  const [stopping, setStopping] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [exchangeStreaming, setExchangeStreaming] = useState(false);

  const { data: initialData, error: detailError } = usePaperRun(runId);
  const { data: portfolioState, error: stateError } = usePaperState(runId);
  const { data: runs, error: runsError } = usePaperRuns();
  const run = initialData?.run ?? null;
  const { data: historicalCandles, error: candlesError } = useCandles(
    run?.symbol ?? "",
    run?.timeframe ?? ""
  );
  const stopMutation = useStopPaperRunMutation();
  const deleteMutation = useDeletePaperRunMutation();
  const trades = initialData?.trades ?? [];
  const sortedTrades = useMemo(
    () =>
      [...trades].sort((left, right) => {
        const leftTime = Date.parse(
          left.opened_at ?? left.closed_at ?? left.created_at ?? ""
        );
        const rightTime = Date.parse(
          right.opened_at ?? right.closed_at ?? right.created_at ?? ""
        );

        return (
          (Number.isFinite(rightTime) ? rightTime : 0) -
          (Number.isFinite(leftTime) ? leftTime : 0)
        );
      }),
    [trades]
  );
  const allIds = useMemo(() => (runs ?? []).map((item) => item.id), [runs]);

  useEffect(() => {
    setCandles([]);
    setExchangeStreaming(false);
  }, [runId]);

  useEffect(() => {
    if (!historicalCandles?.length) {
      return;
    }

    setCandles((current) => {
      const byTimestamp = new Map<number, Candle>();

      for (const candle of historicalCandles) {
        byTimestamp.set(candle.timestamp, candle);
      }

      for (const candle of current) {
        byTimestamp.set(candle.timestamp, candle);
      }

      return [...byTimestamp.values()].sort(
        (left, right) => left.timestamp - right.timestamp
      );
    });
  }, [historicalCandles]);

  /* ================= TRADE TABLE ================= */

  const tradeColumns: ListColumn<PaperTrade>[] = useMemo(
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
        key: "pnl",
        header: "PnL",
        render: (t) => {
          const pnl = Number(t.pnl ?? 0);

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

  const { backendConnected } = usePaperRunEvents(runId, {
    onTick: (candle: PaperTick) => {
      setExchangeStreaming(true);
      setCandles((prev) => {
        const nextCandle: Candle = {
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        };

        const existingIndex = prev.findIndex(
          (item) => item.timestamp === candle.timestamp
        );

        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = nextCandle;
          return next;
        }

        return [...prev, nextCandle].sort(
          (left, right) => left.timestamp - right.timestamp
        );
      });
    },
  });

  /* ================= ACTIONS ================= */

  async function handleStop() {
    if (!runId) return;
    try {
      setStopping(true);
      await stopMutation.mutate(runId);
    } finally {
      setStopping(false);
    }
  }

  async function handleDelete() {
    if (!runId) return;
    if (!confirm("Delete paper run?")) return;
    setDeleting(true);
    await deleteMutation.mutate(runId);
    setDeleting(false);
    navigate("/paper");
  }

  /* ================= UI GUARDS ================= */

  if (!runId) return <div className="p-6 text-slate-400">Invalid run.</div>;
  if (detailError || runsError || stateError || candlesError) {
    return <div className="p-6 text-red-400">{detailError || runsError || stateError || candlesError}</div>;
  }
  if (!run) return <div className="p-6 text-slate-400">Loading...</div>;

  const isRunning = run.status === "ACTIVE";
  const baseAsset = run.symbol.replace("USDT", "");
  const quoteAsset = "USDT";

  const initialBalance = Number(run.initial_balance ?? 0);
  const equity = Number(portfolioState?.equity ?? run.equity ?? 0);
  const usdtBalance = Number(
    portfolioState?.usdt_balance ??
      portfolioState?.balance ??
      run.quote_balance ??
      run.current_balance ??
      initialBalance
  );
  const btcHeld = Math.max(
    0,
    Number(
      portfolioState?.btc_balance ??
        run.base_balance ??
        0
    )
  );
  const realizedPnl = Number(portfolioState?.realized_pnl ?? 0);
  const unrealizedPnl = Number(portfolioState?.unrealized_pnl ?? 0);
  const portfolioOpenPositions = Number(portfolioState?.open_positions ?? 0);
  const equityCurve =
    portfolioState?.equity_curve && portfolioState.equity_curve.length > 0
      ? portfolioState.equity_curve
      : [
          {
            timestamp: run.started_at ? new Date(run.started_at).getTime() : Date.now(),
            equity: initialBalance,
          },
        ];
  const lastPrice = Number(run.last_price ?? 0);
  const totalTrades = Number(portfolioState?.trades_count ?? sortedTrades.length);

  const netPnl = realizedPnl + unrealizedPnl;
  const returnPct = initialBalance
    ? (netPnl / initialBalance) * 100
    : 0;

  const hasPosition = portfolioOpenPositions > 0 && !!run.position;
  const positionSide = run.position?.side ?? null;
  const entryPrice = Number(run.position?.entry_price ?? 0);
  const positionValue = btcHeld * lastPrice;

  /* ===== ADVANCED METRICS ===== */

  const winTrades = sortedTrades.filter(t => Number(t.pnl ?? 0) > 0);
  const lossTrades = sortedTrades.filter(t => Number(t.pnl ?? 0) < 0);

  const winRate = totalTrades
    ? (winTrades.length / totalTrades) * 100
    : 0;

  const avgWin = winTrades.length
    ? winTrades.reduce((a, t) => a + Number(t.pnl ?? 0), 0) / winTrades.length
    : 0;

  const avgLoss = lossTrades.length
    ? lossTrades.reduce((a, t) => a + Number(t.pnl ?? 0), 0) / lossTrades.length
    : 0;

  const exposurePct = equity
    ? (positionValue / equity) * 100
    : 0;

  const maxEquity = Math.max(...equityCurve.map(e => e.equity ?? 0), equity);
  const drawdownPct = maxEquity
    ? ((equity - maxEquity) / maxEquity) * 100
    : 0;

  /* ===== INSTITUTIONAL RISK METRICS ===== */

  const returnsSeries = equityCurve.length > 1
    ? equityCurve.slice(1).map((p, i) => {
        const prev = equityCurve[i].equity ?? 0;
        return prev ? (p.equity - prev) / prev : 0;
      })
    : [];

  const meanReturn =
    returnsSeries.length
      ? returnsSeries.reduce((a, b) => a + b, 0) / returnsSeries.length
      : 0;

  const volatility =
    returnsSeries.length > 1
      ? Math.sqrt(
          returnsSeries.reduce((a, r) => a + Math.pow(r - meanReturn, 2), 0) /
            returnsSeries.length
        )
      : 0;

  const sharpe =
    volatility ? (meanReturn / volatility) * Math.sqrt(returnsSeries.length) : 0;

  const profitFactor =
    avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

  const expectancy =
    totalTrades ? netPnl / totalTrades : 0;

  /* Simple risk score 0–100 */
  const riskScore = Math.min(
    100,
    Math.max(
      0,
      50 +
        returnPct * 0.5 -
        Math.abs(drawdownPct) * 0.7 -
        volatility * 100
    )
  );

  /* Account health indicator */
  const accountHealth =
    riskScore > 70
      ? "Strong"
      : riskScore > 50
      ? "Stable"
      : riskScore > 30
      ? "Risky"
      : "Critical";

  /* ================= UI ================= */

  return (
    <div className="space-y-8">

      {/* HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

        <div className="flex flex-col lg:flex-row justify-between gap-6">

          {/* LEFT */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">
              {run.symbol}
              <span className="text-slate-400 ml-3 text-base">
                {run.timeframe}
              </span>
            </h1>

            <p className="text-slate-500 text-xs">
              Strategy:
              <span
                onClick={() =>
                  navigate(`/algorithms/${run.algorithm_id}`)
                }
                className="ml-2 text-sky-400 hover:text-sky-300 cursor-pointer"
              >
                {run.algorithm_name ?? "—"}
              </span>
            </p>

            {/* STATUS STRIP */}
            <div className="flex items-center gap-5 mt-2">

              <div
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  run.status === "ACTIVE"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "bg-slate-600/20 text-slate-400 border border-slate-600/40"
                }`}
              >
                {run.status === "ACTIVE" ? "Running" : "Stopped"}
              </div>

              <StatusIndicator
                label="Engine"
                active={run.status === "ACTIVE"}
                tooltip="Paper engine execution"
              />

              <StatusIndicator
                label="Exchange"
                active={exchangeStreaming}
                tooltip="Receiving market data stream"
              />

              <StatusIndicator
                label="Backend"
                active={backendConnected}
                tooltip="Connected to backend WebSocket"
              />
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-start gap-3 flex-wrap">
            <DetailNavigator
              ids={allIds}
              currentId={runId}
              basePath="/paper"
            />

            {isRunning && (
              <Button
                variant="STOP"
                size="md"
                loading={stopping}
                loadingText="Stopping..."
                onClick={handleStop}
              >
                Stop
              </Button>
            )}

            <Button
              variant="DELETE"
              size="md"
              loading={deleting}
              loadingText="Deleting..."
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">

        {/* ===== CORE PERFORMANCE ===== */}

        <KpiCard
          title="Total Equity"
          value={equity}
          positive={netPnl >= 0}
          size="compact"
          format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
          sparkline={equityCurve.map(e => e.equity)}
          tooltip="Current account total value"
        />

        <KpiCard
          title="Available Balance"
          value={usdtBalance}
          size="compact"
          format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
          tooltip="Quote balance managed by engine portfolio state"
        />

        <KpiCard
          title="Net PnL"
          value={netPnl}
          positive={netPnl >= 0}
          size="compact"
          format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
          sparkline={equityCurve.map(e => e.equity)}
          tooltip="Profit/loss since session start"
        />

        <KpiCard
          title="Return"
          value={returnPct}
          positive={returnPct >= 0}
          size="compact"
          format={(v) => `${v.toFixed(2)}%`}
        />

        <KpiCard
          title="Drawdown"
          value={drawdownPct}
          positive={drawdownPct >= 0}
          size="compact"
          format={(v) => `${v.toFixed(2)}%`}
          tooltip="Current drawdown from peak equity"
        />

        {/* ===== ACCOUNT STRUCTURE ===== */}

        <KpiCard
          title={`${quoteAsset} Available`}
          value={usdtBalance}
          size="compact"
          format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
        />

        <KpiCard
          title={`${baseAsset} Held`}
          value={btcHeld}
          size="compact"
          format={(v) => `${v.toFixed(6)} ${baseAsset}`}
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
          size="compact"
          format={(v) => `${v.toFixed(1)}%`}
        />

        {/* ===== POSITION ===== */}

        {hasPosition && (
          <>
            <KpiCard
              title="Position"
              value={positionSide === "LONG" ? 1 : -1}
              positive={positionSide === "LONG"}
              size="compact"
              format={() => positionSide ?? "-"}
            />

            <KpiCard
              title="Exposure"
              value={exposurePct}
              positive={exposurePct < 50}
              size="compact"
              format={(v) => `${v.toFixed(1)}%`}
              tooltip="Position value as % of total equity"
            />

            <KpiCard
              title="Entry"
              value={entryPrice}
              size="compact"
              format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
            />

            <KpiCard
              title="Live Price"
              value={lastPrice}
              size="compact"
              format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
            />

            <KpiCard
              title="Unrealized PnL"
              value={unrealizedPnl}
              positive={unrealizedPnl >= 0}
              size="compact"
              format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
            />
          </>
        )}

        {/* ===== TRADE QUALITY ===== */}

        <KpiCard
          title="Avg Win"
          value={avgWin}
          positive={avgWin >= 0}
          size="compact"
          format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
        />

        <KpiCard
          title="Avg Loss"
          value={avgLoss}
          positive={false}
          size="compact"
          format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
        />

        {/* ===== ADVANCED RISK ===== */}

        <KpiCard
          title="Sharpe"
          value={sharpe}
          size="compact"
          format={(v) => v.toFixed(2)}
          tooltip="Risk-adjusted return"
        />

        <KpiCard
          title="Volatility"
          value={volatility * 100}
          size="compact"
          format={(v) => `${v.toFixed(2)}%`}
          tooltip="Return variability"
        />

        <KpiCard
          title="Profit Factor"
          value={profitFactor}
          positive={profitFactor >= 1}
          size="compact"
          format={(v) => v.toFixed(2)}
          tooltip="Avg win / Avg loss"
        />

        <KpiCard
          title="Expectancy"
          value={expectancy}
          positive={expectancy >= 0}
          size="compact"
          format={(v) => `${v.toFixed(2)} ${quoteAsset}`}
          tooltip="Expected PnL per trade"
        />

        <KpiCard
          title="Risk Score"
          value={riskScore}
          positive={riskScore >= 50}
          size="compact"
          format={(v) => `${v.toFixed(0)}/100`}
          tooltip="Composite performance risk index"
        />

        <KpiCard
          title="Account Health"
          value={riskScore}
          positive={riskScore >= 50}
          size="compact"
          format={() => accountHealth}
          tooltip="Overall system state"
        />

      </div>

      {/* CHARTS */}
      <div className="space-y-8">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <h3 className="text-white font-semibold mb-4">Price Chart</h3>
          <CandlestickChart candles={candles} trades={sortedTrades} />
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <h3 className="text-white font-semibold mb-4">Equity Curve</h3>
          <EquityCurveChart equity={equityCurve} />
        </div>
      </div>

      {/* TRADES */}
      <ListView
        title="Trades"
        description="Executed trades"
        columns={tradeColumns}
        data={sortedTrades}
        emptyMessage="No trades yet."
      />
    </div>
  );
}
