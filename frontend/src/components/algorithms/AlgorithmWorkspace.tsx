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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase">
          Strategy Code
        </h2>

        <div className="flex items-center gap-3">
          {isGithub && <span className="text-xs text-amber-400">Synced from GitHub</span>}

          <button
            type="button"
            onClick={() => setDocOpen((v) => !v)}
            className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-lg transition"
          >
            {docOpen ? "Hide Docs" : "Show Docs"}
          </button>
        </div>
      </div>

      <div className="flex gap-6 h-[70vh]">
        <div className={`transition-all duration-300 ${docOpen ? "w-2/3" : "w-full"}`}>
          <div className="h-full">
            <CodeEditor
              value={code}
              onChange={onChange}
              disabled={disabled}
              height="h-full"
            />
          </div>
        </div>

        {docOpen && (
          <div className="w-1/3 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
            <div className="h-full overflow-y-auto p-4">
              <DocumentationPanel code={code} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
