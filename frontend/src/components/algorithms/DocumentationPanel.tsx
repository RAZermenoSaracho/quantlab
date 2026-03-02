import { useState } from "react";
import StrategyAnalyzer from "./StrategyAnalyzer";
import EngineRequirements from "./EngineRequirements";
import ConfigSpecification from "./ConfigSpecification";
import SandboxRules from "./SandboxRules";

type Tab = "requirements" | "config" | "sandbox";

interface Props {
  code: string;
}

export default function DocumentationPanel({ code }: Props) {
  const [tab, setTab] = useState<Tab>("requirements");

  return (
    <div className="w-full min-w-0 max-w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* HEADER */}
      <div className="px-5 py-4 border-b border-slate-800 min-w-0">
        <h3 className="text-lg font-semibold text-white truncate">
          Strategy Console
        </h3>
        <p className="text-xs text-slate-400 mt-1 truncate">
          Real-time validation & engine documentation
        </p>
      </div>

      {/* ANALYZER */}
      <div className="p-5 border-b border-slate-800 bg-slate-950/40 min-w-0 overflow-hidden">
        <StrategyAnalyzer code={code} />
      </div>

      {/* TABS */}
      <div className="flex text-xs border-b border-slate-800 min-w-0 overflow-hidden">
        <TabButton active={tab === "requirements"} onClick={() => setTab("requirements")}>
          Requirements
        </TabButton>
        <TabButton active={tab === "config"} onClick={() => setTab("config")}>
          CONFIG Spec
        </TabButton>
        <TabButton active={tab === "sandbox"} onClick={() => setTab("sandbox")}>
          Sandbox
        </TabButton>
      </div>

      {/* CONTENT */}
      <div
        className={[
          "p-5 max-h-[500px] overflow-y-auto min-w-0",
          // Critical: prevent long code blocks/JSON from forcing horizontal scroll on the page
          "break-words",
          "[&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:max-w-full",
          "[&_code]:break-words [&_code]:whitespace-pre-wrap",
          // Also helps with tables/lists that sometimes overflow
          "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
        ].join(" ")}
      >
        {tab === "requirements" && <EngineRequirements />}
        {tab === "config" && <ConfigSpecification />}
        {tab === "sandbox" && <SandboxRules />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex-1 px-4 py-3 transition font-medium",
        "min-w-0 truncate", // prevent long labels from pushing width
        active
          ? "bg-slate-800 text-white"
          : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800/60",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
