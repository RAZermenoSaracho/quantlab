import { useEffect, useState } from "react";
import BacktestsList from "./backtests/BacktestsList";
import { getAllBacktests } from "../services/backtest.service";
import KpiCard from "../components/ui/KpiCard";

type Backtest = {
  id: string;
  symbol: string;
  timeframe: string;
  initial_balance: string;
  total_return_usdt: string;
  total_return_percent: string;
  total_trades: number;
  win_rate_percent: string;
  status: string;
  created_at: string;
};

export default function Dashboard() {
  const [backtests, setBacktests] = useState<Backtest[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const response = await getAllBacktests();

        // 👇 adaptado al service actual
        const runs = response.backtests || [];
        setBacktests(runs);
      } catch (err) {
        console.error(err);
        setBacktests([]);
      }
    }

    load();
  }, []);

  // =========================
  // KPI CALCULATIONS
  // =========================

  const totalPnL = backtests.reduce(
    (acc, bt) => acc + Number(bt.total_return_usdt || 0),
    0
  );

  const totalTrades = backtests.reduce(
    (acc, bt) => acc + Number(bt.total_trades || 0),
    0
  );

  const avgWinRate =
    backtests.length > 0
      ? backtests.reduce(
          (acc, bt) => acc + Number(bt.win_rate_percent || 0),
          0
        ) / backtests.length
      : 0;

  const activeRuns = backtests.filter(
    (bt) => bt.status === "RUNNING"
  ).length;

  return (
    <div className="space-y-8">
      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Total PnL"
          value={`${totalPnL.toFixed(2)} USDT`}
          positive={totalPnL >= 0}
        />

        <KpiCard
          title="Average Win Rate"
          value={`${avgWinRate.toFixed(2)}%`}
          positive={avgWinRate >= 50}
        />

        <KpiCard
          title="Total Trades"
          value={totalTrades.toString()}
        />

        <KpiCard
          title="Active Runs"
          value={activeRuns.toString()}
        />
      </div>

      {/* TABLE */}
      <BacktestsList />
    </div>
  );
}
