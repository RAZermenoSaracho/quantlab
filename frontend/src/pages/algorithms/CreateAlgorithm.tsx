import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAlgorithm } from "../../services/algorithm.service";

export default function CreateAlgorithm() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const algo = await createAlgorithm({
        name,
        description,
        code: code || undefined,
        githubUrl: githubUrl || undefined,
      });

      navigate(`/algorithms/${algo.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">
        Create Algorithm
      </h1>

      {error && (
        <div className="text-red-400 bg-red-900/30 p-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          placeholder="Algorithm name"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <textarea
          placeholder="Description"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <textarea
          placeholder="Paste your algorithm code here..."
          className="w-full h-64 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />

        <div className="text-slate-400 text-sm text-center">
          OR
        </div>

        <input
          placeholder="GitHub file URL (not raw required)"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-sky-600 hover:bg-sky-700 px-6 py-2 rounded-lg text-white"
        >
          {loading ? "Creating..." : "Create Algorithm"}
        </button>
      </form>
    </div>
  );
}
