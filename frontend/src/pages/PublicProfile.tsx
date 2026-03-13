import { Link, useParams } from "react-router-dom";
import type { AlgorithmSummary, PublicProfileResponse } from "@quantlab/contracts";
import ListView, { type ListColumn } from "../components/ui/ListView";
import PerformanceScore from "../components/algorithms/PerformanceScore";
import { useQuery } from "../data/useQuery";
import { publicProfileKey } from "../data/keys";
import { getPublicProfile } from "../services/auth.service";

export default function PublicProfile() {
  const { username = "" } = useParams<{ username: string }>();
  const { data, loading, error } = useQuery<PublicProfileResponse>({
    key: publicProfileKey(username),
    fetcher: () => getPublicProfile(username),
    enabled: Boolean(username),
  });

  const algorithms = data?.algorithms ?? [];

  const columns: ListColumn<AlgorithmSummary>[] = [
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

  if (error) {
    return (
      <div className="mx-auto max-w-6xl rounded-xl border border-red-800 bg-red-900/30 p-6 text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-sm uppercase tracking-wide text-slate-400">Profile</p>
        <h1 className="mt-2 text-3xl font-bold text-white">
          @{data?.username ?? username}
        </h1>
        <p className="mt-2 text-slate-400">
          Algorithms published and ranked by this creator.
        </p>
      </div>

      <ListView
        title="Algorithms"
        description="Top algorithms for this user, sorted by AI score."
        columns={columns}
        data={algorithms}
        loading={loading}
        emptyMessage="No algorithms available."
        tableId={`profile:${username}`}
      />
    </div>
  );
}
