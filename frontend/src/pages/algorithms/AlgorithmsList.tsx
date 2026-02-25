import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAlgorithms } from "../../services/algorithm.service";
import type { Algorithm } from "../../types/models";
import ListView, { type ListColumn } from "../../components/ui/ListView";

export default function AlgorithmsList() {
  const [algorithms, setAlgorithms] = useState<Algorithm[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const data = await getAlgorithms();
        setAlgorithms(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

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
      key: "created",
      header: "Created",
      render: (algo) =>
        new Date(algo.created_at).toLocaleDateString(),
    },
  ];

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
        <button
          onClick={() => navigate("/algorithms/new")}
          className="bg-sky-600 hover:bg-sky-700 px-4 py-2 rounded-xl text-white font-medium"
        >
          + New Algorithm
        </button>
      }
    />
  );
}