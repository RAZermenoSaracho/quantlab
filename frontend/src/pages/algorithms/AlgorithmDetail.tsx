import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAlgorithmById,
  deleteAlgorithm,
  updateAlgorithm,
  refreshAlgorithmFromGithub,
} from "../../services/algorithm.service";

type Algorithm = {
  id: string;
  name: string;
  description: string | null;
  code: string;
  github_url?: string | null;
  created_at: string;
  updated_at: string;
};

export default function AlgorithmDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [algorithm, setAlgorithm] = useState<Algorithm | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");

  async function loadAlgo(algoId: string) {
    const data = await getAlgorithmById(algoId);
    setAlgorithm(data);
    setName(data.name || "");
    setDescription(data.description || "");
    setCode(data.code || "");
  }

  useEffect(() => {
    if (!id) return;
    loadAlgo(id).catch((e: any) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!algorithm) {
    return <div className="text-slate-400 p-6">Loading...</div>;
  }

  const isGithub = !!algorithm.github_url;

  async function handleDelete() {
    if (!id) return;
    await deleteAlgorithm(id);
    navigate("/algorithms");
  }

  async function handleSave() {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const updated = await updateAlgorithm(id, {
        name,
        description,
        code,
      });

      setAlgorithm(updated);
      setName(updated.name || "");
      setDescription(updated.description || "");
      setCode(updated.code || "");
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const updated = await refreshAlgorithmFromGithub(id);

      // ✅ updated is the algorithm row now
      setAlgorithm(updated);
      setName(updated.name || "");
      setDescription(updated.description || "");
      setCode(updated.code || "");
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">
          {editing ? "Edit Algorithm" : algorithm.name}
        </h1>

        <div className="flex gap-3">
          {isGithub && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-white disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh from GitHub"}
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
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-white disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
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
        <div className="bg-red-900/30 text-red-400 p-3 rounded">{error}</div>
      )}

      {/* GITHUB INFO */}
      {isGithub && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-sm text-slate-300">
          <div className="font-semibold text-slate-200 mb-2">GitHub Source</div>
          <a
            href={algorithm.github_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:underline break-all"
          >
            {algorithm.github_url}
          </a>
        </div>
      )}

      {/* NAME */}
      <div>
        <label className="text-slate-400 text-sm">Name</label>
        {editing ? (
          <input
            className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
        ) : (
          <div className="text-white mt-1">{algorithm.name}</div>
        )}
      </div>

      {/* DESCRIPTION */}
      <div>
        <label className="text-slate-400 text-sm">Description</label>
        {editing ? (
          <textarea
            className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
          />
        ) : (
          <div className="text-slate-300 mt-1">{algorithm.description}</div>
        )}
      </div>

      {/* CODE */}
      <div>
        <label className="text-slate-400 text-sm">Code</label>

        {/* Si es GitHub, no permitimos editar code (solo refresh). */}
        {editing && !isGithub ? (
          <textarea
            className="w-full h-96 mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
          />
        ) : (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-auto">
            <pre className="text-sm text-slate-300 font-mono">{code}</pre>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Updated: {new Date(algorithm.updated_at).toLocaleString()}
      </div>
    </div>
  );
}
