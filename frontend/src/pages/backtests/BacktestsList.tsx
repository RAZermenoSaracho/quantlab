import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllBacktests } from "../../services/backtest.service";
import type { BacktestRun } from "@quantlab/contracts";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import { StatusBadge } from "../../components/ui/StatusBadge";
import Button from "../../components/ui/Button";

function fmtPct(x?: number) {
  if (!x && x !== 0) return "—";
  return `${Number(x).toFixed(2)}%`;
}

function fmtMoney(x?: number) {
  if (!x && x !== 0) return "—";
  return `${Number(x).toFixed(2)} USDT`;
}

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
      key: "strategy",
      header: "Strategy",
      render: (bt) => (
        <div className="flex flex-col">
          <span className="text-white font-medium">
            {bt.algorithm_name ?? "—"}
          </span>
          <span className="text-xs text-slate-500">
            {bt.symbol} • {bt.timeframe} • {bt.exchange}
          </span>
        </div>
      ),
    },
    {
      key: "return",
      header: "Return",
      render: (bt) => {
        const value = bt.total_return_percent ?? undefined;
        const positive = value != null && value >= 0;

        return (
          <span className={positive ? "text-emerald-400" : "text-red-400"}>
            {fmtPct(value)}
          </span>
        );
      },
    },
    {
      key: "profit",
      header: "Net Profit",
      render: (bt) => {
        const value = bt.total_return_usdt ?? undefined;
        const positive = value != null && value >= 0;

        return (
          <span className={positive ? "text-emerald-400" : "text-red-400"}>
            {fmtMoney(value)}
          </span>
        );
      },
    },
    {
      key: "trades",
      header: "Trades",
      render: (bt) => bt.total_trades ?? "—",
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
        navigate(`/backtests/${bt.id}`)
      }
      actions={
        <Button
                  variant="PRIMARY"
                  size="md"
                  onClick={() => navigate("/backtests/new")}
                >
                  + New Backtest
                </Button>
      }
    />
  );
}
