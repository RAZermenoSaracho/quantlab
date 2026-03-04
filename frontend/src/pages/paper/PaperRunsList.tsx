import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAllPaperRuns } from "../../services/paper.service";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import type { PaperRun } from "@quantlab/contracts";
import { StatusBadge } from "../../components/ui/StatusBadge";
import Button from "../../components/ui/Button";
import { formatDateTime } from "../../utils/date";
import { useApi } from "../../hooks/useApi";

export default function PaperRunsList() {
  const navigate = useNavigate();
  const { data, loading } = useApi(getAllPaperRuns, [], {
    fallbackMessage: "Failed to load paper runs",
  });
  const runs = useMemo(() => data?.runs ?? [], [data]);

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
