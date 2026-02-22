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
import RichTextEditor from "../../components/ui/RichTextEditor";
import DetailNavigator from "../../components/navigation/DetailNavigator";

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
    <div className="max-w-6xl mx-auto space-y-8">

      {/* HEADER */}
      <div className="flex justify-between items-start gap-6">

        {/* Left side (Title) */}
        <div>
          {!editing ? (
            <h1 className="text-2xl font-bold text-white">
              {algorithm.name}
            </h1>
          ) : (
            <input
              className="text-2xl font-bold bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </div>

        {/* Right side (Navigator + Buttons) */}
        <div className="flex items-center gap-4">

          <DetailNavigator
            ids={allIds}
            currentId={id!}
            basePath="/algorithms"
          />

          {isGithub && !editing && (
            <button
              onClick={handleRefresh}
              disabled={saving}
              className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-white"
            >
              {saving ? "Refreshing..." : "Refresh"}
            </button>
          )}

          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="bg-sky-600 hover:bg-sky-700 px-4 py-2 rounded-lg text-white"
            >
              Edit
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-white"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}

          <button
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-white"
          >
            Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 text-red-400 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* NOTES */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          Strategy Notes
        </h2>

        {editing ? (
          <RichTextEditor
            value={notesHtml}
            onChange={setNotesHtml}
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

      {/* CODE */}
      <CodeEditor
        value={code}
        onChange={setCode}
        disabled={!editing || isGithub}
        height="h-[600px]"
      />

      <div className="text-xs text-slate-500">
        Updated:{" "}
        {new Date(algorithm.updated_at).toLocaleString()}
      </div>
    </div>
  );
}
