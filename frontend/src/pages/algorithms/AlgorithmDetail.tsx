import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { BacktestRun, PaperRun } from "@quantlab/contracts";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import { StatusBadge } from "../../components/ui/StatusBadge";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import AlgorithmWorkspace from "../../components/algorithms/AlgorithmWorkspace";
import Button from "../../components/ui/Button";
import { formatDateTime } from "../../utils/date";
import {
  useAlgorithm,
  useAlgorithmRuns,
  useAlgorithms,
  useDeleteAlgorithmMutation,
  useRefreshAlgorithmMutation,
  useUpdateAlgorithmMutation,
} from "../../data/algorithms";

type Tab = "overview" | "backtests" | "paper";

type AlgorithmBacktestRun = Pick<
  BacktestRun,
  | "id"
  | "symbol"
  | "timeframe"
  | "status"
  | "created_at"
  | "total_return_percent"
  | "total_return_usdt"
> & {
  exchange?: string;
};

type AlgorithmPaperRun = Pick<
  PaperRun,
  | "id"
  | "symbol"
  | "timeframe"
  | "status"
  | "current_balance"
  | "started_at"
> & {
  exchange?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AlgorithmDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [notesHtml, setNotesHtml] = useState("");
  const [code, setCode] = useState("");

  const {
    data: algorithm,
    loading: algorithmLoading,
    error: algorithmError,
  } = useAlgorithm(id ?? "");
  const {
    data: algorithms,
    loading: algorithmsLoading,
    error: algorithmsError,
  } = useAlgorithms();
  const {
    data: runs,
    loading: runsLoading,
    error: runsError,
  } = useAlgorithmRuns(id ?? "");
  const updateMutation = useUpdateAlgorithmMutation(id ?? "");
  const refreshMutation = useRefreshAlgorithmMutation(id ?? "");
  const deleteMutation = useDeleteAlgorithmMutation();

  const allIds = useMemo(() => algorithms ?? [], [algorithms]).map((item) => item.id);
  const backtests = useMemo(() => runs?.backtests ?? [], [runs]);
  const paperRuns = useMemo(() => runs?.paperRuns ?? [], [runs]);

  useEffect(() => {
    if (!algorithm) {
      return;
    }

    setName(algorithm.name);
    setNotesHtml(algorithm.notes_html || "");
    setCode(algorithm.code);
  }, [algorithm]);

  const detailLoading = algorithmLoading || algorithmsLoading || runsLoading;
  const error = actionError || algorithmError || algorithmsError || runsError;

  if (detailLoading) {
    return (
      <div className="p-6 text-slate-400 animate-pulse">
        Loading algorithm...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-900/30 border border-red-700 text-red-400 rounded-xl">
        {error}
      </div>
    );
  }

  if (!algorithm) {
    return <div className="p-6 text-red-400">Algorithm not found.</div>;
  }

  const isGithub = Boolean(algorithm.github_url);

  async function handleSave() {
    if (!id) {
      return;
    }

    setSaving(true);
    setActionError(null);

    try {
      await updateMutation.mutate({
        name,
        notes_html: notesHtml,
        code,
      });
      setEditing(false);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to save algorithm"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    if (!id) {
      return;
    }

    setSaving(true);
    setActionError(null);

    try {
      const updated = await refreshMutation.mutate(undefined);
      setCode(updated.code);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to refresh algorithm"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) {
      return;
    }

    await deleteMutation.mutate(id);

    const index = allIds.indexOf(id);
    const nextId =
      allIds[(index + 1) % allIds.length] ||
      allIds[(index - 1 + allIds.length) % allIds.length];

    if (nextId && allIds.length > 1) {
      navigate(`/algorithms/${nextId}`);
      return;
    }

    navigate("/algorithms");
  }

  const backtestColumns: ListColumn<AlgorithmBacktestRun>[] = [
    {
      key: "market",
      header: "Market",
      render: (bt) => (
        <div>
          <div className="text-white font-medium">{bt.symbol}</div>
          <div className="text-xs text-slate-500">
            {bt.timeframe}
            {bt.exchange ? ` • ${bt.exchange}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "return",
      header: "Return",
      render: (bt) => {
        const value = Number(bt.total_return_percent ?? 0);
        return (
          <span className={value >= 0 ? "text-emerald-400" : "text-red-400"}>
            {value.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (bt) => <StatusBadge status={bt.status} />,
    },
    {
      key: "created",
      header: "Created",
      render: (bt) => formatDateTime(bt.created_at),
    },
  ];

  const paperColumns: ListColumn<AlgorithmPaperRun>[] = [
    {
      key: "market",
      header: "Market",
      render: (run) => (
        <div>
          <div className="text-white font-medium">{run.symbol}</div>
          <div className="text-xs text-slate-500">
            {run.timeframe}
            {run.exchange ? ` • ${run.exchange}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "equity",
      header: "Equity",
      render: (run) => {
        const equity = Number(run.current_balance ?? 0);
        return <span className="text-slate-300">${equity.toFixed(2)}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (run) => <StatusBadge status={run.status} />,
    },
    {
      key: "started",
      header: "Started",
      render: (run) => (run.started_at ? formatDateTime(run.started_at) : "—"),
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-10 space-y-10">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between gap-8">
          <div>
            {!editing ? (
              <h1 className="text-4xl font-bold text-white">{algorithm.name}</h1>
            ) : (
              <input
                className="text-4xl font-bold bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}

            <p className="text-xs text-slate-500 mt-3">
              Last updated: {formatDateTime(algorithm.updated_at)}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <DetailNavigator ids={allIds} currentId={id!} basePath="/algorithms" />

            {isGithub && !editing && (
              <Button
                variant="WARNING"
                size="md"
                loading={saving}
                loadingText="Refreshing..."
                onClick={handleRefresh}
              >
                Refresh
              </Button>
            )}

            {!editing ? (
              <Button variant="PRIMARY" size="md" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : (
              <Button
                variant="SUCCESS"
                size="md"
                loading={saving}
                loadingText="Saving..."
                onClick={handleSave}
              >
                Save
              </Button>
            )}

            <Button variant="DELETE" size="md" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-8 border-b border-slate-800 text-sm">
        {(["overview", "backtests", "paper"] as Tab[]).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "PRIMARY" : "GHOST"}
            size="sm"
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview" && "Overview"}
            {tab === "backtests" && `Backtests (${backtests.length})`}
            {tab === "paper" && `Paper Runs (${paperRuns.length})`}
          </Button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-10">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-white mb-4">Strategy Notes</h2>

            {editing ? (
              <textarea
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white"
                value={notesHtml}
                onChange={(e) => setNotesHtml(e.target.value)}
              />
            ) : (
              <div
                className="prose prose-invert max-w-none text-slate-300"
                dangerouslySetInnerHTML={{
                  __html: algorithm.notes_html || "",
                }}
              />
            )}
          </div>

          <AlgorithmWorkspace
            code={code}
            onChange={setCode}
            disabled={!editing || isGithub}
            isGithub={isGithub}
          />
        </div>
      )}

      {activeTab === "backtests" && (
        <ListView
          title="Backtests"
          description="Historical runs for this strategy."
          columns={backtestColumns}
          data={backtests}
          loading={false}
          emptyMessage="No backtests yet."
          onRowClick={(bt) => navigate(`/backtests/${bt.id}`)}
        />
      )}

      {activeTab === "paper" && (
        <ListView
          title="Paper Runs"
          description="Live and past simulated trading sessions."
          columns={paperColumns}
          data={paperRuns}
          emptyMessage="No paper runs yet."
          onRowClick={(run) => navigate(`/paper/${run.id}`)}
        />
      )}
    </div>
  );
}
