import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllBacktests } from "../../services/backtest.service";
import type { BacktestRun } from "../../types/models";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import { StatusBadge } from "../../components/ui/StatusBadge";

export default function BacktestsList() {
  const [backtests, setBacktests] = useState<BacktestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const data = await getAllBacktests();
      setBacktests(data.backtests);
      setLoading(false);
    }
    load();
  }, []);

  const columns: ListColumn<BacktestRun>[] = [
    {
      key: "symbol",
      header: "Symbol",
      render: (bt) => (
        <span className="text-white font-medium">
          {bt.symbol}
        </span>
      ),
    },
    {
      key: "timeframe",
      header: "Timeframe",
      render: (bt) => bt.timeframe,
    },
    {
      key: "status",
      header: "Status",
      render: (bt) => <StatusBadge status={bt.status} />,
    },
    {
      key: "created",
      header: "Created",
      render: (bt) =>
        new Date(bt.created_at).toLocaleDateString(),
    },
  ];

  return (
    <ListView
      title="Backtests"
      description="Historical simulation runs."
      columns={columns}
      data={backtests}
      loading={loading}
      emptyMessage="No backtests yet."
      onRowClick={(bt) =>
        navigate(`/backtest/${bt.id}`)
      }
      actions={
        <button
          onClick={() => navigate("/backtests/new")}
          className="bg-sky-600 hover:bg-sky-700 px-4 py-2 rounded-xl text-white"
        >
          + New Backtest
        </button>
      }
    />
  );
}
