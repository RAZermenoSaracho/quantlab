import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

export default function SandboxRules() {
  return (
    <Card>
      <SectionTitle title="Sandbox & Security Rules" />

      <div className="space-y-3 text-sm text-slate-300">

        <div>❌ Imports are not allowed</div>
        <div>❌ While loops are not allowed</div>
        <div>❌ exec / eval / open are blocked</div>
        <div>❌ Dunder attribute access (__class__, etc.)</div>

        <div className="text-xs text-slate-400 mt-2">
          The engine executes your strategy inside a restricted
          sandbox environment.
        </div>

      </div>
    </Card>
  );
}