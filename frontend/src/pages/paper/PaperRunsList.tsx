import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import type { PaperRun } from "@quantlab/contracts";
import { StatusBadge } from "../../components/ui/StatusBadge";
import Button from "../../components/ui/Button";
import ErrorAlert from "../../components/ui/ErrorAlert";
import { formatDateTime } from "../../utils/date";
import {
  useDeletePaperRunMutation,
  usePaperRuns,
  useRestartPaperRunMutation,
  useStopPaperRunMutation,
} from "../../data/paper";

const MAX_CONCURRENT_RUNS = 20;

function isRunActive(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toUpperCase();
  return normalized === "ACTIVE" || normalized === "RUNNING";
}

export default function PaperRunsList() {
  const navigate = useNavigate();
  const [bulkStarting, setBulkStarting] = useState(false);
  const [bulkStopping, setBulkStopping] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const { data, loading } = usePaperRuns();
  const restartMutation = useRestartPaperRunMutation();
  const stopMutation = useStopPaperRunMutation();
  const deleteMutation = useDeletePaperRunMutation();
  const runs = useMemo(() => data ?? [], [data]);
  const runningRuns = useMemo(
    () => runs.filter((run) => isRunActive(run.status)),
    [runs]
  );
  const stoppedRuns = useMemo(
    () => runs.filter((run) => !isRunActive(run.status)),
    [runs]
  );

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

  async function handleStopAll() {
    if (bulkStopping || bulkStarting) {
      return;
    }

    setWarning(null);
    setBulkStopping(true);

    try {
      for (const run of runningRuns) {
        await stopMutation.mutate(run.id);
      }
    } catch (error: unknown) {
      setWarning(
        error instanceof Error
          ? error.message
          : "Failed to stop all active paper runs."
      );
    } finally {
      setBulkStopping(false);
    }
  }

  async function handleStartAll() {
    if (bulkStopping || bulkStarting) {
      return;
    }

    setWarning(null);

    const activeCount = runningRuns.length;
    const remainingSlots = Math.max(0, MAX_CONCURRENT_RUNS - activeCount);

    if (remainingSlots <= 0) {
      setWarning(
        `Maximum concurrent runs reached (${MAX_CONCURRENT_RUNS}). Stop a run before starting another.`
      );
      return;
    }

    const runsToStart = stoppedRuns.slice(0, remainingSlots);
    if (runsToStart.length === 0) {
      return;
    }

    setBulkStarting(true);
    let startedCount = 0;

    try {
      for (const run of runsToStart) {
        await restartMutation.mutate(run.id);
        startedCount += 1;
      }
    } catch (error: unknown) {
      setWarning(
        error instanceof Error
          ? error.message
          : "Failed while starting paper runs."
      );
    } finally {
      setBulkStarting(false);
    }

    if (stoppedRuns.length > startedCount) {
      const capacityAfterStart = Math.max(
        0,
        MAX_CONCURRENT_RUNS - activeCount
      );
      setWarning(
        `Started ${startedCount} run(s). ${stoppedRuns.length - startedCount} not started because only ${capacityAfterStart} slot(s) are available out of ${MAX_CONCURRENT_RUNS} maximum active runs.`
      );
    }
  }

  async function handleDeleteAll() {
    if (bulkStopping || bulkStarting || bulkDeleting || runs.length === 0) {
      return;
    }

    if (!confirm(`Delete all ${runs.length} paper runs?`)) {
      return;
    }

    setWarning(null);
    setBulkDeleting(true);
    try {
      for (const run of runs) {
        await deleteMutation.mutate(run.id);
      }
    } catch (error: unknown) {
      setWarning(
        error instanceof Error
          ? error.message
          : "Failed to delete all paper runs."
      );
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {warning && <ErrorAlert message={warning} />}
      <ListView
        title="Paper Trading"
        description={`Simulated live trading runs (${runningRuns.length}/${MAX_CONCURRENT_RUNS} active)`}
        columns={columns}
        data={runs}
        loading={loading}
        onRowClick={(run) => navigate(`/paper/${run.id}`)}
        actions={
          <>
            <Button
              variant="STOP"
              size="md"
              loading={bulkStopping}
              loadingText="Stopping..."
              disabled={bulkStarting || bulkStopping || bulkDeleting || runningRuns.length === 0}
              onClick={handleStopAll}
            >
              Stop All
            </Button>
            <Button
              variant="SUCCESS"
              size="md"
              loading={bulkStarting}
              loadingText="Starting..."
              disabled={bulkStarting || bulkStopping || bulkDeleting || stoppedRuns.length === 0}
              onClick={handleStartAll}
            >
              Start All
            </Button>
            <Button
              variant="DELETE"
              size="md"
              loading={bulkDeleting}
              loadingText="Deleting..."
              disabled={bulkStarting || bulkStopping || bulkDeleting || runs.length === 0}
              onClick={handleDeleteAll}
            >
              Delete All
            </Button>
            <Button
              variant="PRIMARY"
              size="md"
              disabled={bulkDeleting}
              onClick={() => navigate("/paper/new")}
            >
              + New Paper Run
            </Button>
          </>
        }
      />
    </div>
  );
}
