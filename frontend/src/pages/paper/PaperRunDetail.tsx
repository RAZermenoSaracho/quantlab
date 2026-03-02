import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deletePaperRun,
  getAllPaperRuns,
  getPaperRunById,
  stopPaperRun,
} from "../../services/paper.service";
import { connectSocket } from "../../services/socket.service";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import { StatusBadge } from "../../components/ui/StatusBadge";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import type { PaperRun, PaperTrade } from "../../types/models";
import CandlestickChart from "../../components/charts/CandlestickChart";
import EquityCurveChart from "../../components/charts/EquityCurveChart";

type Candle = {
  run_id: string;
  timestamp: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type EquityPoint = { timestamp: number; equity: number };

export default function PaperRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const runId = id ?? "";
  console.log("CURRENT RUN ID:", runId);

  const [run, setRun] = useState<PaperRun | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [allIds, setAllIds] = useState<string[]>([]);
  const [stopping, setStopping] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);

  const tradeColumns: ListColumn<PaperTrade>[] = useMemo(
    () => [
      { key: "side", header: "Side", render: (t) => t.side },
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
        key: "pnl",
        header: "PnL",
        render: (t) => {
          const pnl = Number(t.pnl ?? 0);
          return (
            <span
              className={
                pnl >= 0
                  ? "text-green-400 font-semibold"
                  : "text-red-400 font-semibold"
              }
            >
              {pnl.toFixed(2)}
            </span>
          );
        },
      },
    ],
    []
  );

  useEffect(() => {
    if (!runId) return;

    let cancelled = false;
    const socket = connectSocket();

    async function load() {
      const [detail, list] = await Promise.all([
        getPaperRunById(runId),
        getAllPaperRuns(),
      ]);

      if (cancelled) return;

      setRun(detail.run);
      setTrades(detail.trades ?? []);
      setAllIds((list.runs ?? []).map((r) => r.id));

      // Seed equity curve so it’s not “flat” due to having only live points
      const seedEquity = Number(detail.run?.equity ?? detail.run?.quote_balance ?? 0);
      if (Number.isFinite(seedEquity) && seedEquity > 0) {
        setEquityCurve([{ timestamp: Date.now(), equity: seedEquity }]);
      }
    }

    load();

    // Join room
    socket.emit("join_paper_run", runId);

    // Connection state
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    // Live events
    const onCandle = (candle: Candle) => {
      console.log("CANDLE RAW:", candle);
      const candleRunId = (candle as any)?.run_id;
      if (candleRunId !== runId) return;

      setCandles((prev) => {
        const ts = String((candle as any)?.timestamp ?? "");
        const exists = prev.some((c) => String(c.timestamp) === ts);
        if (exists) return prev;
        return [...prev, candle];
      });
    };

    const onUpdate = (data: any) => {
      if (data?.run_id !== runId) return;

      setRun((prev) => (prev ? { ...prev, ...data } : prev));

      if (data?.equity != null) {
        const eq = Number(data.equity);
        if (Number.isFinite(eq)) {
          setEquityCurve((prev) => {
            const next = [...prev, { timestamp: Date.now(), equity: eq }];
            // keep last N points so recharts stays fast
            return next.length > 2000 ? next.slice(-2000) : next;
          });
        }
      }
    };

    const onTrade = (trade: PaperTrade) => {
      // IMPORTANT: some engines don’t include run_id in the emitted trade
      const tradeRunId = (trade as any)?.run_id ?? runId;
      if (tradeRunId !== runId) return;

      setTrades((prev) => [({ ...trade, run_id: runId } as any), ...prev]);
    };

    const onStopped = (data: any) => {
      if (data?.run_id !== runId) return;
      setRun((prev) => (prev ? { ...prev, status: "STOPPED" } : prev));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on("candle", onCandle);
    socket.on("update", onUpdate);
    socket.on("trade", onTrade);
    socket.on("stopped", onStopped);

    return () => {
      cancelled = true;

      socket.emit("leave_paper_run", runId);

      // CRITICAL: prevent duplicate listeners in React 18 StrictMode dev
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);

      socket.off("candle", onCandle);
      socket.off("update", onUpdate);
      socket.off("trade", onTrade);
      socket.off("stopped", onStopped);
    };
  }, [runId]);

  async function handleStop() {
    if (!runId) return;
    try {
      setStopping(true);
      await stopPaperRun(runId);
      setRun((prev) => (prev ? { ...prev, status: "STOPPED" } : prev));
    } finally {
      setStopping(false);
    }
  }

  async function handleDelete() {
    if (!runId) return;
    if (!confirm("Delete paper run?")) return;
    setDeleting(true);
    await deletePaperRun(runId);
    setDeleting(false);
    navigate("/paper");
  }

  if (!runId) return <div className="p-6 text-slate-400">Invalid paper run.</div>;
  if (!run) return <div className="p-6 text-slate-400">Loading...</div>;

  const isActive = run.status === "ACTIVE";
  const baseAsset = run.symbol.replace("USDT", "");
  const quoteAsset = "USDT";

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {run.symbol} — {run.timeframe}
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Started: {run.started_at ?? "—"}
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <DetailNavigator ids={allIds} currentId={runId} basePath="/paper" />
          <StatusBadge status={run.status} />

          {isActive && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white"
            >
              {stopping ? "Stopping..." : "Stop"}
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-700 hover:bg-red-800 px-4 py-2 rounded text-white"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>

          <div className="text-xs">
            {socketConnected ? (
              <span className="text-green-400">● Live</span>
            ) : (
              <span className="text-red-400">● Disconnected</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-2">{quoteAsset} Available</div>
          <div className="text-2xl text-white">{Number(run.quote_balance ?? 0).toFixed(2)}</div>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-2">{baseAsset} Held</div>
          <div className="text-2xl text-white">{Number(run.base_balance ?? 0).toFixed(6)}</div>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <div className="text-slate-400 text-sm mb-2">Total Equity</div>
          <div className="text-2xl text-white">{Number(run.equity ?? 0).toFixed(2)}</div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 min-w-0">
          <h3 className="text-white font-semibold mb-4">Price Chart</h3>
          <CandlestickChart candles={candles} trades={trades} />
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <h3 className="text-white font-semibold mb-4">Equity Curve</h3>
          <EquityCurveChart equity={equityCurve} />
        </div>
      </div>

      <ListView<PaperTrade>
        title="Trades"
        description="Executed trades for this paper session"
        columns={tradeColumns}
        data={trades}
        emptyMessage="No trades generated yet."
      />
    </div>
  );
}
