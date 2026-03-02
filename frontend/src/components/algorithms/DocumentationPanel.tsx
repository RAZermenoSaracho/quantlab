import { useState } from "react";
import StrategyAnalyzer from "./StrategyAnalyzer";
import EngineRequirements from "./EngineRequirements";
import ConfigSpecification from "./ConfigSpecification";
import SandboxRules from "./SandboxRules";
import Button from "../ui/Button";

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
      <div className="flex gap-2 border-b border-slate-800 p-2">

        <Button
          variant={tab === "requirements" ? "PRIMARY" : "GHOST"}
          size="sm"
          onClick={() => setTab("requirements")}
        >
          Requirements
        </Button>

        <Button
          variant={tab === "config" ? "PRIMARY" : "GHOST"}
          size="sm"
          onClick={() => setTab("config")}
        >
          CONFIG Spec
        </Button>

        <Button
          variant={tab === "sandbox" ? "PRIMARY" : "GHOST"}
          size="sm"
          onClick={() => setTab("sandbox")}
        >
          Sandbox
        </Button>

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

