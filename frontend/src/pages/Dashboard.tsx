import { useMemo, useState } from "react";
import BacktestsList from "./backtests/BacktestsList";
import PaperRunsList from "./paper/PaperRunsList";
import KpiCard from "../components/ui/KpiCard";
import Button from "../components/ui/Button";
import type { BacktestRun, PaperRun } from "@quantlab/contracts";
import { useBacktests } from "../data/backtests";
import { usePaperRuns } from "../data/paper";

type Tab = "backtests" | "paper";

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
  const activePaperRuns = useMemo(
    () =>
      paperRuns.filter((run) => {
        const status = String(run.status ?? "").toUpperCase();
        return status === "ACTIVE" || status === "RUNNING";
      }),
    [paperRuns]
  );

  if (loading) {
    return <div className="p-6 text-slate-400">Loading dashboard...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-8">

      {/* ================= KPI ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">

        <KpiCard
          title="Backtests (Completed / Total)"
          value={completed.length}
          format={(v) => `${Math.round(v)} / ${backtests.length}`}
          size="compact"
        />

        <KpiCard
          title="Paper Trades (Running / Total)"
          value={activePaperRuns.length}
          format={(v) => `${Math.round(v)} / ${paperRuns.length}`}
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
