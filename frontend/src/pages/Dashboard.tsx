import { useEffect, useMemo, useState } from "react";
import BacktestsList from "./backtests/BacktestsList";
import PaperRunsList from "./paper/PaperRunsList";
import { getAllBacktests } from "../services/backtest.service";
import { getAllPaperRuns } from "../services/paper.service";
import KpiCard from "../components/ui/KpiCard";
import Button from "../components/ui/Button";
import type { BacktestRun, PaperRun } from "../types/models";

type Tab = "backtests" | "paper";

function fmtMoney(x: number, d = 2) {
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(d);
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("backtests");

  const [backtests, setBacktests] = useState<BacktestRun[]>([]);
  const [paperRuns, setPaperRuns] = useState<PaperRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [btRes, prRes] = await Promise.all([
          getAllBacktests(),
          getAllPaperRuns(),
        ]);

        setBacktests(btRes.backtests || []);
        setPaperRuns(prRes.runs || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

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
