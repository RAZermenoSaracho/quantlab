import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAlgorithmById,
  deleteAlgorithm,
  updateAlgorithm,
  refreshAlgorithmFromGithub,
} from "../../services/algorithm.service";
import CodeEditor from "../../components/ui/CodeEditor";

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

  useEffect(() => {
    if (!id) return;

    getAlgorithmById(id)
      .then((data) => {
        setAlgorithm(data);
        setName(data.name);
        setDescription(data.description || "");
        setCode(data.code);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  if (!algorithm) {
    return <div className="text-slate-400 p-6">Loading...</div>;
  }

  const isGithub = !!algorithm.github_url;

  async function handleSave() {
    if (!id) return;

    setLoading(true);
    try {
      const updated = await updateAlgorithm(id, {
        name,
        description,
        code,
      });

      setAlgorithm(updated);
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
    try {
      const updated = await refreshAlgorithmFromGithub(id);
      setAlgorithm(updated);
      setCode(updated.code);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    await deleteAlgorithm(id);
    navigate("/algorithms");
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* HEADER */}
      <div className="flex justify-between items-center">
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

        <div className="flex gap-3">
          {isGithub && !editing && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-white"
            >
              {loading ? "Refreshing..." : "Refresh"}
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
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-white"
            >
              Save
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

      {/* DESCRIPTION */}
      {editing ? (
        <textarea
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      ) : (
        <p className="text-slate-400">{algorithm.description}</p>
      )}

      {/* CODE */}
      <CodeEditor
        value={code}
        onChange={setCode}
        disabled={!editing || isGithub}
        height="h-[600px]"
      />

      <div className="text-xs text-slate-500">
        Updated: {new Date(algorithm.updated_at).toLocaleString()}
      </div>
    </div>
  );
}
