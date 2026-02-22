import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAlgorithm } from "../../services/algorithm.service";
import CodeEditor from "../../components/ui/CodeEditor";
import ConfigDocumentation from "../../components/algorithms/ConfigDocumentation";

export default function CreateAlgorithm() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSubmitDisabled =
    loading || (!code.trim() && !githubUrl.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!code.trim() && !githubUrl.trim()) {
      setError("Provide strategy code or a GitHub URL.");
      return;
    }

    setLoading(true);

    try {
      const algo = await createAlgorithm({
        name,
        description: description || undefined,
        code: code || undefined,
        githubUrl: githubUrl || undefined,
      });

      navigate(`/algorithms/${algo.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create algorithm.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">
          Create Algorithm
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          Define your strategy logic and optional risk configuration.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT SIDE – FORM + EDITOR */}
        <div className="lg:col-span-2 space-y-6">

          <div className="space-y-4">

            <input
              placeholder="Algorithm name"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <textarea
              placeholder="Description (optional)"
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

          </div>

          {/* Code Editor */}
          <div>
            <label className="text-slate-400 text-sm mb-2 block">
              Python Strategy Code
            </label>

            <CodeEditor
              value={code}
              onChange={setCode}
              height="h-[500px]"
            />
          </div>

          {/* Divider */}
          <div className="text-center text-slate-500 text-sm">
            — OR —
          </div>

          <input
            placeholder="GitHub file URL"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="
              bg-sky-600 hover:bg-sky-700 
              transition 
              px-6 py-3 
              rounded-lg 
              text-white 
              font-medium
              disabled:opacity-50 
              disabled:cursor-not-allowed
            "
          >
            {loading ? "Creating Algorithm..." : "Create Algorithm"}
          </button>

        </div>

        {/* RIGHT SIDE – CONFIG DOCUMENTATION */}
        <div className="lg:col-span-1">
          <ConfigDocumentation />
        </div>

      </form>
    </div>
  );
}
