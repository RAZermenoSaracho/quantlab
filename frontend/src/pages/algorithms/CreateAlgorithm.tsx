import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AlgorithmWorkspace from "../../components/algorithms/AlgorithmWorkspace";
import DocumentationPanel from "../../components/algorithms/DocumentationPanel";
import Button from "../../components/ui/Button";
import { useCreateAlgorithmMutation } from "../../data/algorithms";

export default function CreateAlgorithm() {
  const navigate = useNavigate();
  const [mobileTab, setMobileTab] = useState<"details" | "code" | "docs">("details");

  const [name, setName] = useState("");
  const [notesHtml, setNotesHtml] = useState("");
  const [code, setCode] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const createMutation = useCreateAlgorithmMutation();

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
      const algo = await createMutation.mutate({
        name,
        notes_html: notesHtml || undefined,
        code: code || undefined,
        githubUrl: githubUrl || undefined,
      });

      navigate(`/algorithms/${algo.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create algorithm.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-8 lg:space-y-10">

      {/* HEADER */}
      <div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Create Algorithm
        </h1>
        <p className="text-slate-400 text-sm mt-3">
          Build a QuantLab strategy. Your code must define{" "}
          <span className="text-white font-medium">
            generate_signal(ctx)
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
        <div className="lg:hidden flex gap-2 overflow-x-auto whitespace-nowrap border-b border-slate-800 p-2">
          <Button
            size="sm"
            className="flex-shrink-0"
            variant={mobileTab === "details" ? "PRIMARY" : "GHOST"}
            onClick={() => setMobileTab("details")}
          >
            Details
          </Button>
          <Button
            size="sm"
            className="flex-shrink-0"
            variant={mobileTab === "code" ? "PRIMARY" : "GHOST"}
            onClick={() => setMobileTab("code")}
          >
            Code
          </Button>
          <Button
            size="sm"
            className="flex-shrink-0"
            variant={mobileTab === "docs" ? "PRIMARY" : "GHOST"}
            onClick={() => setMobileTab("docs")}
          >
            Docs
          </Button>
        </div>

        {/* TOP SECTION – META + IMPORT */}
        <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6 ${mobileTab === "details" ? "" : "hidden lg:block"}`}>

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
        <div className={mobileTab === "code" ? "" : "hidden lg:block"}>
          <AlgorithmWorkspace
            key="workspace-code"
            code={code}
            onChange={setCode}
            disabled={false}
            isGithub={false}
            initialDocsOpen={false}
          />
        </div>

        <div className={mobileTab === "docs" ? "lg:hidden" : "hidden"}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
            <DocumentationPanel code={code} />
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="pt-6">
          <Button
            type="submit"
            variant="CREATE"
            size="lg"
            loading={loading}
            loadingText="Creating Algorithm..."
            disabled={isSubmitDisabled}
          >
            Create Algorithm
          </Button>
        </div>

      </form>
    </div>
  );
}
