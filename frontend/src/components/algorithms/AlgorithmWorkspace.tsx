import CodeEditor from "../ui/CodeEditor";
import DocumentationPanel from "./DocumentationPanel";
import { useState } from "react";

export type AlgorithmWorkspaceProps = {
  code: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  isGithub?: boolean;
  initialDocsOpen?: boolean;
};

export default function AlgorithmWorkspace({
  code,
  onChange,
  disabled = false,
  isGithub = false,
  initialDocsOpen = true,
}: AlgorithmWorkspaceProps) {
  const [docOpen, setDocOpen] = useState(initialDocsOpen);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full min-w-0 overflow-hidden">
      <div className="flex justify-between items-center mb-4 min-w-0 gap-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase truncate">
          Strategy Code
        </h2>

        <div className="flex items-center gap-3 flex-shrink-0">
          {isGithub && (
            <span className="text-xs text-amber-400 whitespace-nowrap">
              Synced from GitHub
            </span>
          )}

          <button
            type="button"
            onClick={() => setDocOpen((v) => !v)}
            className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-lg transition whitespace-nowrap"
          >
            {docOpen ? "Hide Docs" : "Show Docs"}
          </button>
        </div>
      </div>

      {/* IMPORTANT: min-w-0 + overflow-hidden prevents horizontal overflow */}
      <div className="flex gap-6 h-[70vh] min-w-0 overflow-hidden">
        {/* Editor column */}
        <div
          className={[
            "min-w-0 overflow-hidden transition-all duration-300",
            docOpen ? "flex-[2]" : "flex-1",
          ].join(" ")}
        >
          <div className="h-full min-w-0 overflow-hidden">
            <CodeEditor
              value={code}
              onChange={onChange}
              disabled={disabled}
              height="h-full"
            />
          </div>
        </div>

        {/* Docs column */}
        {docOpen && (
          <div className="min-w-0 flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
            <div className="h-full overflow-y-auto p-4 min-w-0 break-words">
              <DocumentationPanel code={code} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
