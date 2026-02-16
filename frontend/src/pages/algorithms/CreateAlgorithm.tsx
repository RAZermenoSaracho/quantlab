import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAlgorithm } from "../../services/algorithm.service";
import CodeEditor from "../../components/ui/CodeEditor";

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
    <div className="max-w-5xl mx-auto space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-white">
          Create Algorithm
        </h1>
        <p className="text-slate-400 text-sm">
          Write your strategy or import it from GitHub.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 text-red-400 p-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        <input
          placeholder="Algorithm name"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <textarea
          placeholder="Description (optional)"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <label className="text-slate-400 text-sm">
            Python Strategy Code
          </label>

          <CodeEditor
            value={code}
            onChange={setCode}
            height="h-[500px]"
          />
        </div>

        <div className="text-center text-slate-500 text-sm">
          — OR —
        </div>

        <input
          placeholder="GitHub file URL"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-sky-600 hover:bg-sky-700 px-6 py-2 rounded-lg text-white disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Algorithm"}
        </button>
      </form>
    </div>
  );
}
