import { useMemo, useState } from "react";
import BacktestsList from "./backtests/BacktestsList";
import PaperRunsList from "./paper/PaperRunsList";
import KpiCard from "../components/ui/KpiCard";
import Button from "../components/ui/Button";
import type { BacktestRun, PaperRun } from "@quantlab/contracts";
import { useBacktests } from "../data/backtests";
import { usePaperRuns } from "../data/paper";

type Tab = "backtests" | "paper";

function fmtMoney(x: number, d = 2) {
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(d);
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("backtests");
  const { data: backtestsData, loading: backtestsLoading } = useBacktests();
  const { data: paperRunsData, loading: paperRunsLoading } = usePaperRuns();
  const backtests: BacktestRun[] = backtestsData ?? [];
  const paperRuns: PaperRun[] = paperRunsData ?? [];
  const loading = backtestsLoading || paperRunsLoading;

  const completed = useMemo(
    () => backtests.filter((bt) => bt.status === "COMPLETED"),
    [backtests]
  );

  const totalPnL = useMemo(() => {
    return completed.reduce((acc, bt) => {
      const pnl = Number(bt.analysis?.summary?.net_profit ?? 0);
      return acc + pnl;
    }, 0);
  }, [completed]);

  if (loading) {
    return <div className="p-6 text-slate-400">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">

      {/* ================= KPI ================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">

        <KpiCard
          title="Total Backtests"
          value={backtests.length}
          size="compact"
        />

        <KpiCard
          title="Completed"
          value={completed.length}
          size="compact"
        />

        <KpiCard
          title="Paper Runs"
          value={paperRuns.length}
          size="compact"
        />

        <KpiCard
          title="Total Net PnL"
          value={totalPnL}
          positive={totalPnL >= 0}
          format={(v) => `${fmtMoney(v)} USDT`}
          size="compact"
        />

      </div>

      {/* ================= TABS ================= */}
      <div className="flex gap-4 border-b border-slate-800 pb-3">

        <Button
          variant={activeTab === "backtests" ? "PRIMARY" : "GHOST"}
          size="sm"
          onClick={() => setActiveTab("backtests")}
        >
          Backtest Runs
        </Button>

        <Button
          variant={activeTab === "paper" ? "PRIMARY" : "GHOST"}
          size="sm"
          onClick={() => setActiveTab("paper")}
        >
          Paper Runs
        </Button>

      </div>

      {/* ================= CONTENT ================= */}

      {activeTab === "backtests" && <BacktestsList />}
      {activeTab === "paper" && <PaperRunsList />}

    </div>
  );
}
