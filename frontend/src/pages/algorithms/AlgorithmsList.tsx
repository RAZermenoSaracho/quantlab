import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Algorithm } from "@quantlab/contracts";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import Button from "../../components/ui/Button";
import PerformanceScore from "../../components/algorithms/PerformanceScore";
import {
  useAlgorithms,
  useDeleteAlgorithmMutation,
} from "../../data/algorithms";

export default function AlgorithmsList() {
  const navigate = useNavigate();
  const [deletingAll, setDeletingAll] = useState(false);
  const { data, loading } = useAlgorithms();
  const deleteMutation = useDeleteAlgorithmMutation();
  const algorithms = useMemo(() => data ?? [], [data]);

  const columns: ListColumn<Algorithm>[] = [
    {
      key: "name",
      header: "Name",
      render: (algo) => (
        <span className="text-white font-medium">
          {algo.name}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (algo) => (
        <div
          className="prose prose-invert max-w-none text-slate-300 line-clamp-2"
          dangerouslySetInnerHTML={{
            __html: algo.notes_html || "<span class='text-slate-500'>—</span>",
          }}
        />
      ),
      className: "max-w-md",
    },
    {
      key: "performance_score",
      header: "Performance Score",
      render: (algo) => (
        <PerformanceScore score={Number(algo.performance_score ?? 0)} compact />
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (algo) =>
        new Date(algo.created_at).toLocaleDateString(),
    },
  ];

  async function handleDeleteAll() {
    if (deletingAll || algorithms.length === 0) {
      return;
    }

    if (!confirm(`Delete all ${algorithms.length} algorithms?`)) {
      return;
    }

    setDeletingAll(true);
    try {
      for (const algorithm of algorithms) {
        await deleteMutation.mutate(algorithm.id);
      }
    } finally {
      setDeletingAll(false);
    }
  }

  return (
    <ListView
      title="Algorithms"
      description="Reusable trading strategies used in backtests and paper trading."
      columns={columns}
      data={algorithms}
      loading={loading}
      emptyMessage="No algorithms yet."
      onRowClick={(algo) =>
        navigate(`/algorithms/${algo.id}`)
      }
      actions={
        <>
          <Button
            variant="DELETE"
            size="md"
            loading={deletingAll}
            loadingText="Deleting..."
            disabled={deletingAll || algorithms.length === 0}
            onClick={handleDeleteAll}
          >
            Delete All
          </Button>
          <Button
            variant="PRIMARY"
            size="md"
            onClick={() => navigate("/algorithms/new")}
          >
            + New Algorithm
          </Button>
        </>
      }
    />
  );
}
