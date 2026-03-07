import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import type { PaperRun } from "@quantlab/contracts";
import { StatusBadge } from "../../components/ui/StatusBadge";
import Button from "../../components/ui/Button";
import { formatDateTime } from "../../utils/date";
import { usePaperRuns } from "../../data/paper";

export default function PaperRunsList() {
  const navigate = useNavigate();
  const { data, loading } = usePaperRuns();
  const runs = useMemo(() => data ?? [], [data]);

  const columns: ListColumn<PaperRun>[] = [
    {
      key: "strategy",
      header: "Strategy",
      render: (item) => (
        <div className="flex flex-col">
          <span className="text-white font-medium">
            {item.algorithm_name ?? "—"}
          </span>
          <span className="text-xs text-slate-500">
            {item.symbol} • {item.timeframe} • {item.exchange}
          </span>
        </div>
      ),
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
        `$${Number(item.quote_balance ?? item.current_balance ?? 0).toFixed(2)}`,
    },
    {
      key: "equity",
      header: "Total Equity",
      render: (item) => {
        const quote = Number(item.quote_balance ?? item.current_balance ?? 0);
        const base = Number(item.base_balance ?? 0);
        const last = Number(item.last_price ?? 0);
        const equity = quote + (base * last);
        return `$${equity.toFixed(2)}`;
      },
    },
    {
      key: "pnl",
      header: "PnL",
      render: (item) => {
        const quote = Number(item.quote_balance ?? item.current_balance ?? 0);
        const base = Number(item.base_balance ?? 0);
        const last = Number(item.last_price ?? 0);
        const equity = quote + (base * last);
        const pnl = equity - Number(item.initial_balance ?? 0);
        const className =
          pnl >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium";
        return <span className={className}>{`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}</span>;
      },
    },
    {
      key: "started",
      header: "Started",
      render: (item) =>
        item.started_at ? formatDateTime(item.started_at) : "—",
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
        <Button
          variant="PRIMARY"
          size="md"
          onClick={() => navigate("/paper/new")}
        >
          + New Paper Run
        </Button>
      }
    />
  );
}
