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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">

      {/* HEADER */}
      <div className="px-5 py-4 border-b border-slate-800">
        <h3 className="text-lg font-semibold text-white">
          Strategy Console
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Real-time validation & engine documentation
        </p>
      </div>

      {/* ANALYZER */}
      <div className="p-5 border-b border-slate-800 bg-slate-950/40">
        <StrategyAnalyzer code={code} />
      </div>

      {/* TABS */}
      <div className="flex text-xs border-b border-slate-800">
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
      <div className="p-5 max-h-[500px] overflow-y-auto">
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
      onClick={onClick}
      className={`flex-1 px-4 py-3 transition font-medium ${
        active
          ? "bg-slate-800 text-white"
          : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800/60"
      }`}
    >
      {children}
    </button>
  );
}