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
import KpiCard from "../../components/ui/KpiCard";
import MetricCard from "../../components/ui/MetricCard";

type BacktestDetailPayload = {
  run: any;
  metrics?: any;
  analysis?: any;
  trades: any[];
  equity_curve: any[];
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
  return arr.length
    ? arr.reduce((a, b) => a + b, 0) / arr.length
    : 0;
}

function std(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(
    arr.reduce((a, x) => a + (x - m) ** 2, 0) / arr.length
  );
}

function computeReturns(equity: number[]) {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    out.push(
      equity[i - 1]
        ? equity[i] / equity[i - 1] - 1
        : 0
    );
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
      key = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

    if (period === "weekly") {
      const d = new Date(date);
      d.setDate(date.getDate() - date.getDay());
      key = d.toISOString().slice(0, 10);
    }

    if (period === "daily")
      key = date.toISOString().slice(0, 10);

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(Number(p.equity ?? 0));
  }

  return Object.entries(grouped)
    .map(([k, values]) => {
      if (values.length < 2) return null;
      const first = values[0];
      const last = values[values.length - 1];
      const ret = first
        ? ((last - first) / first) * 100
        : 0;
      return { period: k, returnPct: ret };
    })
    .filter(Boolean) as {
    period: string;
    returnPct: number;
  }[];
}

/* ================= COMPONENT ================= */

export default function BacktestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] =
    useState<BacktestDetailPayload | null>(null);
  const [allIds, setAllIds] = useState<string[]>([]);
  const [error, setError] =
    useState<string | null>(null);
  const [loadingDelete, setLoadingDelete] =
    useState(false);

  const [returnPeriod, setReturnPeriod] =
    useState<
      "yearly" | "monthly" | "weekly" | "daily"
    >("yearly");

  const [selectedPeriod, setSelectedPeriod] =
    useState<string | null>(null);

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    async function load() {
      if (!id) return;

      const detail = await getBacktest(id);
      setData(detail);

      const list = await getAllBacktests();
      setAllIds(
        list.backtests.map((b: any) => b.id)
      );
    }

    load().catch(() =>
      setError("Failed to load backtest")
    );
  }, [id]);

  /* ================= SAFE FALLBACK DATA ================= */

  const run = data?.run ?? {};
  const metrics = data?.metrics ?? {};
  const analysis = data?.analysis ?? {};
  const trades = data?.trades ?? [];
  const equity_curve = data?.equity_curve ?? [];

  /* ================= DERIVED DATA ================= */

  const equity = useMemo(
    () =>
      equity_curve.map((p: any) =>
        Number(p.equity ?? 0)
      ),
    [equity_curve]
  );

  const returns = useMemo(
    () => computeReturns(equity),
    [equity]
  );

  const derived = useMemo(() => {
    const initial =
      Number(run.initial_balance ?? 0);
    const final =
      equity[equity.length - 1] ?? initial;

    const netProfit = final - initial;
    const retPct = initial
      ? (netProfit / initial) * 100
      : 0;

    const vol = std(returns);
    const sharpe = vol
      ? mean(returns) / vol
      : 0;

    return {
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
    metrics?.sharpe ??
    derived.sharpe;

  const volatility =
    analysis?.risk?.volatility ??
    metrics?.volatility ??
    derived.volatility;

  const maxDD =
    analysis?.risk?.max_drawdown_pct ??
    metrics?.max_drawdown_percent ??
    derived.maxDD;

  const periodReturns = useMemo(
    () =>
      groupReturns(
        equity_curve,
        returnPeriod
      ),
    [equity_curve, returnPeriod]
  );

  const avgPeriodReturn = mean(
    periodReturns.map(
      (p) => p.returnPct
    )
  );

  const specificReturn =
    selectedPeriod
      ? periodReturns.find(
          (p) =>
            p.period === selectedPeriod
        )?.returnPct ?? null
      : null;

  /* ================= ACTIONS ================= */

  async function handleDelete() {
    if (!confirm("Delete backtest?"))
      return;

    setLoadingDelete(true);
    await deleteBacktest(id!);
    navigate("/backtests");
  }

  /* ================= CONDITIONAL UI ================= */

  if (error) {
    return (
      <div className="p-6 text-red-400">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-slate-400">
        Loading...
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {run.symbol} — {run.timeframe}
          </h1>
          <p className="text-slate-400 text-sm">
            {run.start_date?.slice(0, 10)} →{" "}
            {run.end_date?.slice(0, 10)}
          </p>
        </div>

        <div className="flex gap-4 items-center">
          <DetailNavigator
            ids={allIds}
            currentId={id!}
            basePath="/backtest"
          />
          <StatusBadge status={run.status} />
          <button
            onClick={handleDelete}
            className="bg-red-600 px-4 py-2 rounded text-white"
          >
            {loadingDelete
              ? "Deleting..."
              : "Delete"}
          </button>
        </div>
      </div>

      {/* CORE METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          title="Net Profit"
          value={`${fmtMoney(netProfit)} USDT`}
          positive={netProfit >= 0}
        />
        <KpiCard
          title="Return"
          value={fmtPct(retPct)}
          positive={retPct >= 0}
        />
        <KpiCard
          title="Sharpe"
          value={fmtMoney(sharpe, 2)}
        />
        <KpiCard
          title="Volatility"
          value={fmtPct(volatility * 100)}
        />
        <KpiCard
          title="Max Drawdown"
          value={fmtPct(maxDD)}
        />
      </div>

      {/* PERIOD ANALYSIS */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
        <div className="flex justify-between">
          <h3 className="text-white font-semibold">
            Period Analysis
          </h3>

          <select
            value={returnPeriod}
            onChange={(e) =>
              setReturnPeriod(
                e.target.value as any
              )
            }
            className="bg-slate-900 text-white px-3 py-1 rounded"
          >
            <option value="yearly">
              Yearly
            </option>
            <option value="monthly">
              Monthly
            </option>
            <option value="weekly">
              Weekly
            </option>
            <option value="daily">
              Daily
            </option>
          </select>
        </div>

        <MetricCard
          title={`Average ${returnPeriod} Return`}
          value={fmtPct(avgPeriodReturn)}
          positive={
            avgPeriodReturn >= 0
          }
        />

        <select
          value={selectedPeriod ?? ""}
          onChange={(e) =>
            setSelectedPeriod(
              e.target.value
            )
          }
          className="bg-slate-900 text-white px-3 py-1 rounded"
        >
          <option value="">
            Select specific period
          </option>

          {periodReturns.map((p) => (
            <option
              key={p.period}
              value={p.period}
            >
              {p.period}
            </option>
          ))}
        </select>

        {specificReturn != null && (
          <MetricCard
            title="Selected Period Return"
            value={fmtPct(
              specificReturn
            )}
            positive={
              specificReturn >= 0
            }
          />
        )}
      </div>

      {/* EQUITY CHART */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-white font-semibold mb-4">
          Equity Curve
        </h3>
        <EquityCurveChart
          equity={equity_curve}
        />
      </div>

      {/* TRADES TABLE */}
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
              const pnl = Number(t.pnl ?? 0);
              const pnlPct = Number(t.pnl_percent ?? 0);

              return (
                <tr
                  key={i}
                  className="border-t border-slate-700 hover:bg-slate-900"
                >
                  <td className="px-4 py-3 text-slate-500">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3">
                    {t.side}
                  </td>
                  <td className="px-4 py-3">
                    {Number(t.quantity).toFixed(4)}
                  </td>
                  <td className="px-4 py-3">
                    {Number(t.entry_price).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    {t.exit_price
                      ? Number(t.exit_price).toFixed(2)
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {t.opened_at
                      ?.slice(0, 19)
                      .replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {t.closed_at
                      ?.slice(0, 19)
                      .replace("T", " ")}
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      pnl >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {pnl.toFixed(2)}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      pnlPct >= 0
                        ? "text-green-300"
                        : "text-red-300"
                    }`}
                  >
                    {pnlPct
                      ? `${pnlPct.toFixed(2)}%`
                      : "-"}
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
