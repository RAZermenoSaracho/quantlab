import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AlgorithmWorkspace from "../../components/algorithms/AlgorithmWorkspace";
import ConfigSpecification from "../../components/algorithms/ConfigSpecification";
import EngineRequirements from "../../components/algorithms/EngineRequirements";
import SandboxRules from "../../components/algorithms/SandboxRules";
import StrategyAnalyzer from "../../components/algorithms/StrategyAnalyzer";
import StrategyBuilder from "../../components/algorithms/StrategyBuilder";
import StrategyPromptGenerator from "../../components/algorithms/StrategyPromptGenerator";
import StrategyParametersDocs from "../../components/docs/StrategyParametersDocs";
import Button from "../../components/ui/Button";
import {
  useAlgorithm,
  useCreateAlgorithmMutation,
  useUpdateAlgorithmMutation,
} from "../../data/algorithms";

export default function CreateAlgorithm() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const [mobileTab, setMobileTab] = useState<"details" | "code" | "docs">("details");
  const [generatorMode, setGeneratorMode] = useState<"builder" | "prompt" | "docs">("builder");

  const [name, setName] = useState("");
  const [notesHtml, setNotesHtml] = useState("");
  const [code, setCode] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingGithubCode, setFetchingGithubCode] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const { data: algorithm, loading: loadingAlgorithm, error: algorithmError } = useAlgorithm(
    isEditMode ? id ?? "" : ""
  );
  const createMutation = useCreateAlgorithmMutation();
  const updateMutation = useUpdateAlgorithmMutation(id ?? "");

  useEffect(() => {
    if (!isEditMode || !algorithm) {
      return;
    }
    setName(algorithm.name ?? "");
    setNotesHtml(algorithm.notes_html ?? "");
    setCode(algorithm.code ?? "");
    setGithubUrl(algorithm.github_url ?? "");
    setIsPublic(Boolean(algorithm.is_public));
  }, [isEditMode, algorithm]);

  const isSubmitDisabled =
    loading || fetchingGithubCode || !code.trim();

  async function handleFetchCodeFromGithub() {
    setError(null);

    const url = githubUrl.trim();
    if (!url) {
      setError("Provide a GitHub raw file URL first.");
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      setError("GitHub URL must start with http:// or https://");
      return;
    }

    setFetchingGithubCode(true);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch code (${response.status})`);
      }
      const text = await response.text();
      if (!text.trim()) {
        throw new Error("Fetched file is empty.");
      }
      setCode(text);
      setAttemptedSubmit(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch code from GitHub.");
    } finally {
      setFetchingGithubCode(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAttemptedSubmit(true);

    if (!code.trim()) {
      setError("Algorithm code cannot be empty.");
      return;
    }

    setLoading(true);

    try {
      if (isEditMode && id) {
        const updated = await updateMutation.mutate({
          name,
          notes_html: notesHtml || undefined,
          code: code || undefined,
          is_public: isPublic,
        });
        navigate(`/algorithms/${updated.id}`);
      } else {
        const created = await createMutation.mutate({
          name,
          notes_html: notesHtml || undefined,
          code: code || undefined,
          githubUrl: githubUrl || undefined,
          is_public: isPublic,
        });
        navigate(`/algorithms/${created.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${isEditMode ? "update" : "create"} algorithm.`);
    } finally {
      setLoading(false);
    }
  }

  if (isEditMode && loadingAlgorithm) {
    return <div className="p-6 text-slate-400 animate-pulse">Loading algorithm...</div>;
  }

  if (isEditMode && algorithmError) {
    return (
      <div className="p-6 bg-red-900/30 border border-red-700 text-red-400 rounded-xl">
        {algorithmError}
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-8 lg:space-y-10">

      <div>
        <h1 className="text-4xl font-bold text-white tracking-tight">
          {isEditMode ? "Edit Algorithm" : "Create Algorithm"}
        </h1>
        <p className="text-slate-400 text-sm mt-3">
          Build a QuantLab strategy. Your code must define{" "}
          <span className="text-white font-medium">generate_signal(ctx)</span>.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 p-4 rounded-xl">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-10">
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

        <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6 ${mobileTab === "details" ? "" : "hidden lg:block"}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <input
              placeholder="Algorithm name"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-600 outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                placeholder="GitHub raw file URL (optional)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-600 outline-none"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                disabled={isEditMode}
              />
              <Button
                variant="WARNING"
                loading={fetchingGithubCode}
                loadingText="Fetching..."
                onClick={handleFetchCodeFromGithub}
                disabled={isEditMode}
              >
                Fetch Code from GitHub
              </Button>
            </div>
          </div>

          <textarea
            placeholder="Description (optional)"
            rows={3}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-sky-600 outline-none"
            value={notesHtml}
            onChange={(e) => setNotesHtml(e.target.value)}
          />

          <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900"
            />
            <span>
              Public algorithm. Private algorithms still appear in ranking and profiles, but their code and GitHub link stay hidden.
            </span>
          </label>

        </div>

        <div className={mobileTab === "code" ? "space-y-6" : "hidden lg:block lg:space-y-6"}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={generatorMode === "builder" ? "PRIMARY" : "GHOST"}
              size="sm"
              onClick={() => setGeneratorMode("builder")}
            >
              Strategy Builder
            </Button>
            <Button
              type="button"
              variant={generatorMode === "prompt" ? "PRIMARY" : "GHOST"}
              size="sm"
              onClick={() => setGeneratorMode("prompt")}
            >
              Prompt Generator
            </Button>
            <Button
              type="button"
              variant={generatorMode === "docs" ? "PRIMARY" : "GHOST"}
              size="sm"
              onClick={() => setGeneratorMode("docs")}
            >
              Docs
            </Button>
          </div>

          {generatorMode === "builder" ? (
            <StrategyBuilder onGenerate={setCode} />
          ) : generatorMode === "prompt" ? (
            <StrategyPromptGenerator />
          ) : (
            <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div>
                <h3 className="text-lg font-semibold text-white">Documentation</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Reference the engine rules and supported strategy parameters while you write.
                </p>
              </div>
              <section className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Config Specification
                </h4>
                <ConfigSpecification />
              </section>
              <section className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Engine Requirements
                </h4>
                <EngineRequirements />
              </section>
              <section className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Sandbox Rules
                </h4>
                <SandboxRules />
              </section>
              <section className="space-y-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Strategy Parameters
                </h4>
                <StrategyParametersDocs />
              </section>
            </div>
          )}

          <AlgorithmWorkspace
            key={`workspace-code-${isEditMode ? "edit" : "create"}`}
            code={code}
            onChange={setCode}
            disabled={false}
            isGithub={false}
            initialDocsOpen={false}
            showEmptyCodeError={attemptedSubmit}
            showDocumentation={false}
          />

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Strategy Analyzer
            </h3>
            <StrategyAnalyzer code={code} />
          </div>
        </div>

        <div className={mobileTab === "docs" ? "lg:hidden" : "hidden"}>
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <div>
              <h3 className="text-lg font-semibold text-white">Documentation</h3>
              <p className="mt-1 text-sm text-slate-400">
                Reference the engine rules and supported strategy parameters while you write.
              </p>
            </div>
            <ConfigSpecification />
            <EngineRequirements />
            <SandboxRules />
            <StrategyParametersDocs />
          </div>
        </div>

        <div className="pt-6">
          <Button
            type="submit"
            variant={isEditMode ? "SUCCESS" : "CREATE"}
            size="lg"
            loading={loading}
            loadingText={isEditMode ? "Saving Changes..." : "Creating Algorithm..."}
            disabled={isSubmitDisabled}
          >
            {isEditMode ? "Save Changes" : "Create Algorithm"}
          </Button>
        </div>
      </form>
    </div>
  );
}
