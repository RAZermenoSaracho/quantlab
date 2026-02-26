import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAlgorithm } from "../../services/algorithm.service";
import CodeEditor from "../../components/ui/CodeEditor";
import DocumentationPanel from "../../components/algorithms/DocumentationPanel";

export default function CreateAlgorithm() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [notesHtml, setNotesHtml] = useState("");
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
        notes_html: notesHtml || undefined,
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
    <div className="max-w-[1600px] mx-auto px-8 py-10 space-y-10">

      {/* HEADER */}
      <div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Create Algorithm
        </h1>
        <p className="text-slate-400 text-sm mt-3">
          Build a QuantLab strategy. Your code must define{" "}
          <span className="text-white font-medium">
            generate_signal(candle)
          </span>.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 p-4 rounded-xl">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-10"
      >

        {/* TOP SECTION – META + IMPORT */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <input
              placeholder="Algorithm name"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-600 outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <input
              placeholder="GitHub raw file URL (optional)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-600 outline-none"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
            />

          </div>

          <textarea
            placeholder="Description (optional)"
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-600 outline-none"
            value={notesHtml}
            onChange={(e) => setNotesHtml(e.target.value)}
          />

        </div>

        {/* WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 min-h-[calc(100vh-350px)]">

          {/* CODE COLUMN */}
          <div className="lg:col-span-3 flex flex-col">

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col flex-1">

              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                  Strategy Code
                </h2>
                {githubUrl && (
                  <span className="text-xs text-amber-400">
                    External source provided
                  </span>
                )}
              </div>

              <div className="flex-1">
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  height="h-full"
                />
              </div>

            </div>

          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 flex flex-col">

            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col flex-1 overflow-hidden">

              <div className="flex-1 overflow-y-auto p-4">
                <DocumentationPanel code={code} />
              </div>

            </div>

          </div>

        </div>

        {/* SUBMIT BUTTON */}
        <div className="pt-6">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="
              bg-gradient-to-r from-sky-600 to-indigo-600
              hover:opacity-90
              transition
              px-10 py-4
              rounded-xl
              text-white
              font-semibold
              shadow-lg
              disabled:opacity-40
            "
          >
            {loading ? "Creating Algorithm..." : "Create Algorithm"}
          </button>
        </div>

      </form>
    </div>
  );
}
