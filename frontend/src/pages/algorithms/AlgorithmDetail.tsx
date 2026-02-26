import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAlgorithms,
  getAlgorithmById,
  deleteAlgorithm,
  updateAlgorithm,
  refreshAlgorithmFromGithub,
} from "../../services/algorithm.service";
import CodeEditor from "../../components/ui/CodeEditor";
import type { Algorithm } from "../../types/models";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import DocumentationPanel from "../../components/algorithms/DocumentationPanel";

export default function AlgorithmDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [allIds, setAllIds] = useState<string[]>([]);
  const [algorithm, setAlgorithm] = useState<Algorithm | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [notesHtml, setNotesHtml] = useState("");
  const [code, setCode] = useState("");

  /* ===========================
     LOAD DATA
  =========================== */

  useEffect(() => {
    async function load() {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        const [algo, list] = await Promise.all([
          getAlgorithmById(id),
          getAlgorithms(),
        ]);

        setAlgorithm(algo);
        setName(algo.name);
        setNotesHtml(algo.notes_html || "");
        setCode(algo.code);

        const ids = list.map((item) => item.id);
        setAllIds(ids);
      } catch (err: any) {
        setError(err.message || "Failed to load algorithm");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  /* ===========================
     EARLY RETURNS
  =========================== */

  if (loading) {
    return (
      <div className="text-slate-400 p-6 animate-pulse">
        Loading algorithm...
      </div>
    );
  }

  if (!algorithm) {
    return (
      <div className="text-red-400 p-6">
        Algorithm not found.
      </div>
    );
  }

  const isGithub = Boolean(algorithm.github_url);

  /* ===========================
     ACTIONS
  =========================== */

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

  /* ===========================
     UI
  =========================== */

  return (
    <div className="max-w-[1600px] mx-auto px-8 py-10 space-y-10">

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-8">

        <div>
          {!editing ? (
            <h1 className="text-4xl font-bold text-white tracking-tight">
              {algorithm.name}
            </h1>
          ) : (
            <input
              className="text-4xl font-bold bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white w-full focus:ring-2 focus:ring-sky-600 outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}

          <p className="text-xs text-slate-500 mt-3">
            Last updated: {new Date(algorithm.updated_at).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">

          <DetailNavigator
            ids={allIds}
            currentId={id!}
            basePath="/algorithms"
          />

          {isGithub && !editing && (
            <button
              onClick={handleRefresh}
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 transition px-5 py-3 rounded-xl text-white font-medium"
            >
              {saving ? "Refreshing..." : "Refresh"}
            </button>
          )}

          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="
                bg-gradient-to-r from-sky-600 to-indigo-600
                hover:opacity-90
                transition
                px-5 py-3
                rounded-xl
                text-white
                font-medium
                shadow-md
              "
            >
              Edit
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 transition px-5 py-3 rounded-xl text-white font-medium shadow-md"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}

          <button
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 transition px-5 py-3 rounded-xl text-white font-medium"
          >
            Delete
          </button>

        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* NOTES */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-lg space-y-6">
        <h2 className="text-lg font-semibold text-white">
          Strategy Notes
        </h2>

        {editing ? (
          <textarea
            placeholder="Description (optional)"
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-600 outline-none"
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
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 min-h-[80vh]">

        {/* CODE EDITOR */}
        <div className="lg:col-span-3 flex flex-col">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col flex-1">

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                Strategy Code
              </h2>
              {isGithub && (
                <span className="text-xs text-amber-400">
                  Synced from GitHub
                </span>
              )}
            </div>

            <div className="flex-1">
              <CodeEditor
                value={code}
                onChange={setCode}
                disabled={!editing || isGithub}
                height="h-full"
              />
            </div>

          </div>

        </div>

        {/* DOCUMENTATION PANEL */}
        <div className="lg:col-span-2 flex flex-col">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col flex-1 overflow-hidden">

            <div className="flex-1 overflow-y-auto p-4">
              <DocumentationPanel code={code} />
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
