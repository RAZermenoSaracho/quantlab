import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAlgorithms,
  getAlgorithmById,
  deleteAlgorithm,
  updateAlgorithm,
  refreshAlgorithmFromGithub,
  getAlgorithmRuns,
} from "../../services/algorithm.service";

import type { Algorithm } from "../../types/models";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import { StatusBadge } from "../../components/ui/StatusBadge";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import AlgorithmWorkspace from "../../components/algorithms/AlgorithmWorkspace";

type Tab = "overview" | "backtests" | "paper";

export default function AlgorithmDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [allIds, setAllIds] = useState<string[]>([]);
  const [algorithm, setAlgorithm] = useState<Algorithm | null>(null);
  const [backtests, setBacktests] = useState<any[]>([]);
  const [paperRuns, setPaperRuns] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [notesHtml, setNotesHtml] = useState("");
  const [code, setCode] = useState("");

  /* ================= LOAD ================= */

  useEffect(() => {
    async function load() {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        const [algo, list, runs] = await Promise.all([
          getAlgorithmById(id),
          getAlgorithms(),
          getAlgorithmRuns(id),
        ]);

        setAlgorithm(algo);
        setName(algo.name);
        setNotesHtml(algo.notes_html || "");
        setCode(algo.code);

        setBacktests(runs.backtests || []);
        setPaperRuns(runs.paperRuns || []);
        setAllIds(list.map((item: any) => item.id));
      } catch (err: any) {
        setError(err.message || "Failed to load algorithm");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  /* ================= EARLY RETURNS ================= */

  if (loading) {
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
    return (
      <div className="p-6 text-red-400">
        Algorithm not found.
      </div>
    );
  }

  const isGithub = Boolean(algorithm.github_url);

  /* ================= ACTIONS ================= */

  async function handleSave() {
    if (!id) return;

    setSaving(true);
    setError(null);

    try {
      const updated = await updateAlgorithm(id, {
        name,
        notes_html: notesHtml,
        code,
      });

      setAlgorithm(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    if (!id) return;

    setSaving(true);
    try {
      const updated = await refreshAlgorithmFromGithub(id);
      setAlgorithm(updated);
      setCode(updated.code);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;

    await deleteAlgorithm(id);

    const index = allIds.indexOf(id);
    const nextId =
      allIds[(index + 1) % allIds.length] ||
      allIds[(index - 1 + allIds.length) % allIds.length];

    if (nextId && allIds.length > 1) {
      navigate(`/algorithms/${nextId}`);
    } else {
      navigate("/algorithms");
    }
  }

  /* ================= BACKTEST COLUMNS ================= */

  const backtestColumns: ListColumn<any>[] = [
    {
      key: "market",
      header: "Market",
      render: (bt) => (
        <div>
          <div className="text-white font-medium">
            {bt.symbol}
          </div>
          <div className="text-xs text-slate-500">
            {bt.timeframe} • {bt.exchange}
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
      render: (bt) =>
        new Date(bt.created_at).toLocaleDateString(),
    },
  ];

  /* ================= UI ================= */

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-10 space-y-10">

      {/* HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between gap-8">

          <div>
            {!editing ? (
              <h1 className="text-4xl font-bold text-white">
                {algorithm.name}
              </h1>
            ) : (
              <input
                className="text-4xl font-bold bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}

            <p className="text-xs text-slate-500 mt-3">
              Last updated: {new Date(algorithm.updated_at).toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <DetailNavigator
              ids={allIds}
              currentId={id!}
              basePath="/algorithms"
            />

            {isGithub && !editing && (
              <button
                onClick={handleRefresh}
                disabled={saving}
                className="bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-xl text-white"
              >
                {saving ? "Refreshing..." : "Refresh"}
              </button>
            )}

            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="bg-sky-600 hover:bg-sky-700 px-4 py-2 rounded-xl text-white"
              >
                Edit
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-xl text-white"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            )}

            <button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-white"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-8 border-b border-slate-800 text-sm">
        {(["overview", "backtests", "paper"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 transition ${
              activeTab === tab
                ? "text-white border-b-2 border-sky-500"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab === "overview" && "Overview"}
            {tab === "backtests" && `Backtests (${backtests.length})`}
            {tab === "paper" && `Paper Runs (${paperRuns.length})`}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}

      {activeTab === "overview" && (
        <div className="space-y-10">

          {/* NOTES */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              Strategy Notes
            </h2>

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

          {/* WORKSPACE */}
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-slate-400">
          Paper Runs list coming soon.
        </div>
      )}

    </div>
  );
}
