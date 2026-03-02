import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllPaperRuns } from "../../services/paper.service";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import type { PaperRun } from "../../types/models";
import { StatusBadge } from "../../components/ui/StatusBadge";

export default function PaperRunsList() {
  const [runs, setRuns] = useState<PaperRun[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchRuns() {
      try {
        const res = await getAllPaperRuns();
        setRuns(res?.runs ?? []);
      } finally {
        setLoading(false);
      }
    }

    fetchRuns();
  }, []);

  const columns: ListColumn<PaperRun>[] = [
    {
      key: "symbol",
      header: "Market",
      render: (item) => `${item.symbol} (${item.timeframe})`,
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: "balance",
      header: "Balance",
      render: (item) =>
        `$${Number(item.current_balance ?? 0).toFixed(2)}`,
    },
    {
      key: "started",
      header: "Started",
      render: (item) =>
        item.started_at
          ? new Date(item.started_at).toLocaleString()
          : "—",
    },
  ];

  return (
    <ListView
      title="Paper Trading"
      description="Simulated live trading runs"
      columns={columns}
      data={runs}
      loading={loading}
      onRowClick={(run) => navigate(`/paper/${run.id}`)}
      actions={
        <button
          onClick={() => navigate("/paper/new")}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white transition"
        >
          + New Paper Run
        </button>
      }
    />
  );
}
