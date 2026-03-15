import { Link } from "react-router-dom";
import type { AlgorithmSummary } from "@quantlab/contracts";
import ListView, { type ListColumn } from "../components/ui/ListView";
import KpiCard from "../components/ui/KpiCard";
import PerformanceScore from "../components/algorithms/PerformanceScore";
import { useAlgorithmRanking } from "../data/algorithms";

export default function Ranking() {
  const { data, loading } = useAlgorithmRanking();
  const algorithms = data ?? [];
  const leader = algorithms[0];

  const columns: ListColumn<AlgorithmSummary>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (algorithm) => (
        <span className="text-white font-medium">
          #{algorithms.findIndex((item) => item.id === algorithm.id) + 1}
        </span>
      ),
    },
    {
      key: "algorithm",
      header: "Algorithm",
      render: (algorithm) => (
        <Link
          to={`/algorithms/${algorithm.id}`}
          className="text-sky-400 hover:text-sky-300 font-medium"
        >
          {algorithm.name}
        </Link>
      ),
    },
    {
      key: "creator",
      header: "Creator",
      render: (algorithm) =>
        algorithm.username ? (
          <Link
            to={`/profile/${algorithm.username}`}
            className="text-slate-300 hover:text-white"
          >
            @{algorithm.username}
          </Link>
        ) : (
          <span className="text-slate-500">—</span>
        ),
    },
    {
      key: "performance_score",
      header: "AI Score",
      render: (algorithm) => (
        <PerformanceScore score={algorithm.performance_score} compact />
      ),
    },
    {
      key: "return",
      header: "Return",
      render: (algorithm) => `${Number(algorithm.avg_return_percent).toFixed(2)}%`,
    },
    {
      key: "sharpe",
      header: "Sharpe",
      render: (algorithm) => Number(algorithm.avg_sharpe).toFixed(2),
    },
    {
      key: "drawdown",
      header: "Drawdown",
      render: (algorithm) => `${Number(algorithm.max_drawdown).toFixed(2)}%`,
    },
    {
      key: "runs",
      header: "Runs",
      render: (algorithm) => Number(algorithm.runs_count).toFixed(0),
    },
    {
      key: "open_source",
      header: "Open Source",
      render: (algorithm) => (
        <span className={algorithm.is_public ? "text-emerald-400" : "text-amber-300"}>
          {algorithm.is_public ? "Yes" : "Private"}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      <div className="grid gap-4 md:grid-cols-3 mt-4">
        <KpiCard title="Algorithms Ranked" value={algorithms.length} />
        <KpiCard
          title="Top AI Score"
          value={Number(leader?.performance_score ?? 0)}
          format={(value) => value.toFixed(1)}
        />
        <KpiCard
          title="Top Creator"
          value={0}
          format={() => (leader?.username ? `@${leader.username}` : "—")}
        />
      </div>

      <ListView
        title="Ranking"
        description="Top 50 algorithms by AI performance score."
        columns={columns}
        data={algorithms}
        loading={loading}
        emptyMessage="No algorithms available yet."
        tableId="ranking"
      />
    </div>
  );
}
