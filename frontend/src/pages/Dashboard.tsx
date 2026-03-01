import { useEffect, useMemo, useState } from "react";
import BacktestsList from "./backtests/BacktestsList";
import { getAllBacktests } from "../services/backtest.service";
import KpiCard from "../components/ui/KpiCard";
import type { BacktestRun } from "../types/models";

export default function Dashboard() {
  const [backtests, setBacktests] = useState<BacktestRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await getAllBacktests();
        const runs = response.backtests || [];
        setBacktests(runs);
      } catch (err) {
        console.error(err);
        setBacktests([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // =====================================================
  // FILTER COMPLETED ONLY (real performance stats)
  // =====================================================

  const completed = useMemo(
    () => backtests.filter((bt) => bt.status === "COMPLETED"),
    [backtests]
  );

  const running = useMemo(
    () => backtests.filter((bt) => bt.status === "RUNNING").length,
    [backtests]
  );

  // =====================================================
  // AGGREGATE METRICS
  // =====================================================

  const stats = useMemo(() => {
    if (!completed.length) {
      return {
        totalPnL: 0,
        avgReturn: 0,
        totalTrades: 0,
        avgWinRate: 0,
        avgProfitFactor: 0,
      };
    }

    const totalPnL = completed.reduce(
      (acc, bt) => acc + Number(bt.total_return_usdt || 0),
      0
    );

    const avgReturn =
      completed.reduce(
        (acc, bt) => acc + Number(bt.total_return_percent || 0),
        0
      ) / completed.length;

    const totalTrades = completed.reduce(
      (acc, bt) => acc + Number(bt.total_trades || 0),
      0
    );

    const avgWinRate =
      completed.reduce(
        (acc, bt) => acc + Number(bt.win_rate_percent || 0),
        0
      ) / completed.length;

    const avgProfitFactor =
      completed.reduce(
        (acc, bt) => acc + Number(bt.profit_factor || 0),
        0
      ) / completed.length;

    return {
      totalPnL,
      avgReturn,
      totalTrades,
      avgWinRate,
      avgProfitFactor,
    };
  }, [completed]);

  // =====================================================
  // UI
  // =====================================================

  if (loading) {
    return (
      <div className="p-6 text-slate-400">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ================= KPI GRID ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">

        <KpiCard
          title="Total Net PnL"
          value={`${stats.totalPnL.toFixed(2)} USDT`}
          positive={stats.totalPnL >= 0}
        />

        <KpiCard
          title="Average Return"
          value={`${stats.avgReturn.toFixed(2)}%`}
          positive={stats.avgReturn >= 0}
        />

        <KpiCard
          title="Total Trades"
          value={stats.totalTrades.toString()}
        />

        <KpiCard
          title="Avg Win Rate"
          value={`${stats.avgWinRate.toFixed(2)}%`}
          positive={stats.avgWinRate >= 50}
        />

        <KpiCard
          title="Avg Profit Factor"
          value={stats.avgProfitFactor.toFixed(2)}
          positive={stats.avgProfitFactor >= 1}
        />

      </div>

      {/* ================= SECONDARY STATS ================= */}
      <div className="flex justify-between items-center text-sm text-slate-400">
        <div>
          Total Backtests:{" "}
          <span className="text-slate-200 font-medium">
            {backtests.length}
          </span>
        </div>

        <div>
          Running:{" "}
          <span className="text-yellow-400 font-medium">
            {running}
          </span>
        </div>

        <div>
          Completed:{" "}
          <span className="text-green-400 font-medium">
            {completed.length}
          </span>
        </div>
      </div>

      {/* ================= TABLE ================= */}
      <BacktestsList />
    </div>
  );
}
