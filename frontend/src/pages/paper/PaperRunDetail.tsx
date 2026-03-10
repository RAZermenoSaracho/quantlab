import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import type {
  Candle,
  OrderUpdateEvent,
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
  usePaperRunChart,
  usePaperRuns,
  useRestartPaperRunMutation,
  usePaperState,
  useStopPaperRunMutation,
} from "../../data/paper";

const MAX_STORED_CANDLES = 10_000;

function normalizeSymbol(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function mergeCandles(
  existing: Candle[] | undefined,
  incoming: Candle[] | undefined
): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const candle of existing ?? []) {
    byTimestamp.set(Number(candle.timestamp), candle);
  }
  for (const candle of incoming ?? []) {
    byTimestamp.set(Number(candle.timestamp), candle);
  }
  return [...byTimestamp.values()]
    .sort((left, right) => Number(left.timestamp) - Number(right.timestamp))
    .slice(-MAX_STORED_CANDLES);
}

function mergeChartBuckets(
  preRunCandles: Candle[] | undefined,
  runCandles: Candle[] | undefined,
  liveOrCachedCandles: Candle[] | undefined
): Candle[] {
  // Precedence: pre-run < run < live/cached
  return mergeCandles(
    mergeCandles(preRunCandles, runCandles),
    liveOrCachedCandles
  );
}

export default function PaperRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const runId = id ?? "";

  const [stopping, setStopping] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesBySymbol, setCandlesBySymbol] = useState<Record<string, Candle[]>>({});
  const [pendingOrdersBySymbol, setPendingOrdersBySymbol] = useState<Record<string, number>>({});
  const [exchangeStreaming, setExchangeStreaming] = useState(false);

  const { data: initialData, error: detailError } = usePaperRun(runId);
  const { data: chartData, error: chartError } = usePaperRunChart(runId);
  const { data: portfolioState, error: stateError } = usePaperState(runId);
  const { data: runs, error: runsError } = usePaperRuns();
  const run = initialData?.run ?? null;
  const stopMutation = useStopPaperRunMutation();
  const restartMutation = useRestartPaperRunMutation();
  const deleteMutation = useDeletePaperRunMutation();
  const trades = initialData?.trades ?? chartData?.trades ?? [];
  const getTradeNetPnl = (trade: PaperTrade) =>
    Number(trade.net_pnl ?? trade.pnl ?? 0);
  const getTradeGrossPnl = (trade: PaperTrade) =>
    Number(trade.gross_pnl ?? getTradeNetPnl(trade));
  const getTradeEntryNotional = (trade: PaperTrade) =>
    Number(
      trade.entry_notional ??
        Number(trade.entry_price ?? 0) * Number(trade.quantity ?? 0)
    );
  const getTradeExitNotional = (trade: PaperTrade) =>
    trade.exit_notional != null
      ? Number(trade.exit_notional)
      : trade.exit_price != null
        ? Number(trade.exit_price) * Number(trade.quantity ?? 0)
        : null;
  const getTradeTotalFee = (trade: PaperTrade) =>
    Number(
      trade.total_fee ??
        Number(trade.entry_fee ?? 0) +
          Number(trade.exit_fee ?? 0)
    );
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
    setCandlesBySymbol({});
    setPendingOrdersBySymbol({});
    setExchangeStreaming(false);
  }, [runId]);

  useEffect(() => {
    if (!chartData) {
      return;
    }

    setCandlesBySymbol((current) => {
      const next: Record<string, Candle[]> = { ...current };
      const symbolBuckets = chartData.symbols ?? {};
      const chartBySymbol = chartData.candles_by_symbol ?? {};

      for (const [symbolKey, bucket] of Object.entries(symbolBuckets)) {
        const normalizedSymbol = normalizeSymbol(symbolKey);
        if (!normalizedSymbol) {
          continue;
        }
        next[normalizedSymbol] = mergeChartBuckets(
          bucket.pre_run_candles,
          bucket.run_candles,
          next[normalizedSymbol]
        );
      }

      for (const [symbolKey, symbolCandles] of Object.entries(chartBySymbol)) {
        const normalizedSymbol = normalizeSymbol(symbolKey);
        if (!normalizedSymbol) {
          continue;
        }
        next[normalizedSymbol] = mergeCandles(symbolCandles, next[normalizedSymbol]);
      }

      if (
        Object.keys(symbolBuckets).length === 0 &&
        Object.keys(chartBySymbol).length === 0 &&
        chartData.candles?.length
      ) {
        const defaultSymbol = normalizeSymbol(
          initialData?.run?.symbols?.[0] ??
            initialData?.run?.symbol?.split(",")[0] ??
            run?.symbol?.split(",")[0] ??
            "UNKNOWN"
        );
        next[defaultSymbol] = mergeCandles(chartData.candles, next[defaultSymbol]);
      }

      return next;
    });
  }, [chartData, initialData?.run?.symbol, initialData?.run?.symbols, run?.symbol]);

  useEffect(() => {
    const primarySymbol = normalizeSymbol(
      run?.symbols?.[0] ?? run?.symbol?.split(",")[0] ?? "UNKNOWN"
    );
    setCandles(candlesBySymbol[primarySymbol] ?? []);
  }, [candlesBySymbol, run?.symbol, run?.symbols]);

  const shouldSubscribeToRealtime = Boolean(
    runId &&
      run &&
      !chartError &&
      chartData !== undefined
  );

  /* ================= TRADE TABLE ================= */

  const tradeColumns: ListColumn<PaperTrade>[] = useMemo(
    () => [
      {
        key: "symbol",
        header: "Symbol",
        render: (t) => normalizeSymbol(t.symbol) || "—",
      },

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
            <span
              className={
                grossPnl >= 0
                  ? "text-emerald-300 font-medium"
                  : "text-red-300 font-medium"
              }
            >
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

  const { backendConnected } = usePaperRunEvents(
    shouldSubscribeToRealtime ? runId : "",
    {
    onTick: (candle: PaperTick) => {
      setExchangeStreaming(true);
      const symbolKey = normalizeSymbol(
        candle.symbol ??
          run?.symbols?.[0] ??
          run?.symbol?.split(",")[0] ??
          "UNKNOWN"
      );

      setCandlesBySymbol((prev) => {
        const nextCandle: Candle = {
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        };
        return {
          ...prev,
          [symbolKey]: mergeCandles(prev[symbolKey], [nextCandle]),
        };
      });
    },
    onOrderUpdate: (payload: OrderUpdateEvent) => {
      const symbolKey = normalizeSymbol(payload.order.symbol);
      if (!symbolKey) {
        return;
      }
      setPendingOrdersBySymbol((prev) => {
        const current = Number(prev[symbolKey] ?? 0);
        if (payload.event_type === "order_created") {
          return { ...prev, [symbolKey]: current + 1 };
        }
        if (payload.event_type === "order_filled" || payload.event_type === "order_cancelled") {
          return { ...prev, [symbolKey]: Math.max(0, current - 1) };
        }
        return prev;
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

  async function handleRestart() {
    if (!runId) return;
    try {
      setRestarting(true);
      await restartMutation.mutate(runId);
    } finally {
      setRestarting(false);
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
  if (detailError || runsError || stateError || chartError) {
    return <div className="p-6 text-red-400">{detailError || runsError || stateError || chartError}</div>;
  }
  if (!run) return <div className="p-6 text-slate-400">Loading...</div>;

  const isRunning = run.status === "ACTIVE";
  const configuredSymbols =
    run.symbols && run.symbols.length > 0
      ? run.symbols
      : run.symbol
          .split(",")
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean);
  const primarySymbol = configuredSymbols[0] ?? run.symbol;
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
  const realizedPnl = Number(portfolioState?.realized_pnl ?? 0);
  const unrealizedPnl = Number(portfolioState?.unrealized_pnl ?? 0);
  const positionsBySymbol = (portfolioState?.positions ?? {}) as Record<string, Record<string, unknown>>;
  const lastPricesBySymbol = (portfolioState?.last_prices ?? {}) as Record<string, number>;
  const globalPendingOrders = Number(portfolioState?.pending_orders ?? 0);
  const equityCurve =
    portfolioState?.equity_curve && portfolioState.equity_curve.length > 0
      ? portfolioState.equity_curve
      : [
          {
            timestamp: run.started_at ? new Date(run.started_at).getTime() : Date.now(),
            equity: initialBalance,
          },
        ];
  const totalTrades = Number(portfolioState?.trades_count ?? sortedTrades.length);

  const netPnl = realizedPnl + unrealizedPnl;
  const returnPct = initialBalance
    ? (netPnl / initialBalance) * 100
    : 0;

  /* ===== ADVANCED METRICS ===== */

  const winTrades = sortedTrades.filter((t) => getTradeNetPnl(t) > 0);
  const lossTrades = sortedTrades.filter((t) => getTradeNetPnl(t) < 0);

  const winRate = totalTrades
    ? (winTrades.length / totalTrades) * 100
    : 0;

  const avgWin = winTrades.length
    ? winTrades.reduce((a, t) => a + getTradeNetPnl(t), 0) / winTrades.length
    : 0;

  const avgLoss = lossTrades.length
    ? lossTrades.reduce((a, t) => a + getTradeNetPnl(t), 0) / lossTrades.length
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

  const fromDataSymbols = Object.keys(candlesBySymbol);
  const chartSymbols = [
    ...new Set([...configuredSymbols, ...fromDataSymbols]),
  ];
  const effectiveChartSymbols =
    chartSymbols.length > 0 ? chartSymbols : [primarySymbol];
  const pairOverview = effectiveChartSymbols.map((symbolItem) => {
    const symbolPosition = positionsBySymbol[symbolItem] ?? null;
    const symbolCandles =
      candlesBySymbol[symbolItem] ??
      (symbolItem === primarySymbol ? candles : []);
    const latestCandle = symbolCandles[symbolCandles.length - 1];
    const livePrice = Number(
      lastPricesBySymbol[symbolItem] ??
        latestCandle?.close ??
        run.last_price ??
        0
    );
    const quantity = Math.max(
      0,
      Number(
        symbolPosition?.quantity ??
          symbolPosition?.base_qty ??
          0
      )
    );
    const marketValue = Number(
      symbolPosition?.market_value ?? quantity * livePrice
    );
    const symbolExposurePct =
      equity > 0 ? (marketValue / equity) * 100 : 0;
    const symbolUnrealizedPnl = Number(
      symbolPosition?.unrealized_pnl ?? 0
    );
    const symbolEntryPrice = Number(
      symbolPosition?.entry_price ?? 0
    );
    const symbolAvgEntryPrice = Number(
      symbolPosition?.average_entry_price ?? symbolEntryPrice
    );
    const symbolPendingOrders = Number(
      pendingOrdersBySymbol[symbolItem] ??
        (globalPendingOrders > 0 && symbolItem === primarySymbol ? globalPendingOrders : 0)
    );
    const symbolTrades = sortedTrades.filter((trade) => {
      if (trade.symbol) {
        return normalizeSymbol(trade.symbol) === symbolItem;
      }
      return effectiveChartSymbols.length === 1 || symbolItem === primarySymbol;
    });

    return {
      symbol: symbolItem,
      livePrice,
      quantity,
      side: String(symbolPosition?.side ?? "FLAT"),
      entryPrice: symbolEntryPrice,
      averageEntryPrice: symbolAvgEntryPrice,
      exposurePct: symbolExposurePct,
      unrealizedPnl: symbolUnrealizedPnl,
      pendingOrders: symbolPendingOrders,
      lastCandleTimestamp: latestCandle?.timestamp ?? null,
      entriesCount: Number(symbolPosition?.entries_count ?? 0),
      tradesCount: symbolTrades.length,
    };
  });

  /* ================= UI ================= */

  return (
    <div className="w-full min-w-0 max-w-full space-y-8">

      {/* HEADER */}
      <div className="w-full min-w-0 max-w-full bg-slate-900 border border-slate-800 rounded-2xl p-6">

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 md:gap-6">

          {/* LEFT */}
          <div className="min-w-0 space-y-2 break-words">
            <h1 className="text-2xl font-bold text-white break-words">
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
            <div className="flex flex-wrap items-center gap-3 md:gap-5 mt-2">

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
          <div className="min-w-0 flex items-start md:justify-end gap-2 md:gap-3 flex-wrap overflow-x-auto">
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

            {!isRunning && (
              <Button
                variant="SUCCESS"
                size="md"
                loading={restarting}
                loadingText="Restarting..."
                onClick={handleRestart}
              >
                Restart
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
      <div className="w-full min-w-0 max-w-full grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">

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

      <div className="w-full min-w-0 max-w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Pair Overview</h2>
          <span className="text-xs text-slate-400">
            {effectiveChartSymbols.length} pair{effectiveChartSymbols.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pairOverview.map((pair) => (
            <div
              key={pair.symbol}
              className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">{pair.symbol}</h3>
                <span className="text-xs text-slate-400">
                  {pair.side}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-slate-400">Live Price</span>
                <span className="text-right text-slate-200">{pair.livePrice.toFixed(4)}</span>

                <span className="text-slate-400">Base Held</span>
                <span className="text-right text-slate-200">{pair.quantity.toFixed(6)}</span>

                <span className="text-slate-400">Entry Price</span>
                <span className="text-right text-slate-200">
                  {pair.entryPrice > 0 ? pair.entryPrice.toFixed(4) : "—"}
                </span>

                <span className="text-slate-400">Avg Entry</span>
                <span className="text-right text-slate-200">
                  {pair.averageEntryPrice > 0 ? pair.averageEntryPrice.toFixed(4) : "—"}
                </span>

                <span className="text-slate-400">Exposure</span>
                <span className="text-right text-slate-200">{pair.exposurePct.toFixed(2)}%</span>

                <span className="text-slate-400">Unrealized PnL</span>
                <span className={pair.unrealizedPnl >= 0 ? "text-right text-emerald-300" : "text-right text-red-300"}>
                  {pair.unrealizedPnl.toFixed(2)}
                </span>

                <span className="text-slate-400">Pending Orders</span>
                <span className="text-right text-slate-200">{pair.pendingOrders}</span>

                <span className="text-slate-400">Entries/Fills</span>
                <span className="text-right text-slate-200">{pair.entriesCount || pair.tradesCount}</span>

                <span className="text-slate-400">Last Candle</span>
                <span className="text-right text-slate-200">
                  {pair.lastCandleTimestamp ? formatDateTime(new Date(pair.lastCandleTimestamp).toISOString()) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHARTS */}
      <div className="w-full min-w-0 max-w-full space-y-4">
        {effectiveChartSymbols.map((symbolItem) => {
          const symbolCandles =
            candlesBySymbol[symbolItem] ??
            (symbolItem === primarySymbol ? candles : []);
          const symbolTrades = sortedTrades.filter((trade) => {
            if (trade.symbol) {
              return normalizeSymbol(trade.symbol) === symbolItem;
            }
            return effectiveChartSymbols.length === 1 || symbolItem === primarySymbol;
          });

          return (
            <div
              key={symbolItem}
              id={`candle-chart-wrapper-${symbolItem}`}
              className="w-full min-w-0 max-w-full bg-slate-800 p-6 rounded-xl border border-slate-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">
                  Price Chart ({symbolItem}) - Candles + Trades
                </h3>
              </div>

              <CandlestickChart candles={symbolCandles} trades={symbolTrades} />
            </div>
          );
        })}
      </div>

      <div id="equity-chart-wrapper" className="w-full min-w-0 max-w-full bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-white font-semibold mb-4">Equity Curve</h3>
        <EquityCurveChart equity={equityCurve} />
      </div>

      {/* <div className="w-full min-w-0 max-w-full space-y-8">
        <div className="w-full min-w-0 max-w-full bg-slate-900 p-6 rounded-xl border border-slate-800">
          <h3 className="text-white font-semibold mb-4">Price Chart</h3>
          <CandlestickChart candles={candles} trades={sortedTrades} />
        </div>

        <div className="w-full min-w-0 max-w-full bg-slate-900 p-6 rounded-xl border border-slate-800">
          <h3 className="text-white font-semibold mb-4">Equity Curve</h3>
          <EquityCurveChart equity={equityCurve} />
        </div>
      </div> */}

      {/* TRADES */}
      <div className="w-full min-w-0 overflow-x-auto">
        <ListView
          tableId="paper_trades_v2"
          title="Trades"
          description="Executed trades"
          columns={tradeColumns}
          data={sortedTrades}
          emptyMessage="No trades yet."
        />
      </div>
    </div>
  );
}
