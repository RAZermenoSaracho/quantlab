import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

export default function EngineRequirements() {
  return (
    <Card>
      <SectionTitle title="Required Structure" />

      <div className="space-y-4 text-sm text-slate-300">

        <div>
          Your strategy MUST define:
        </div>

        <pre className="bg-slate-900 p-3 rounded text-xs overflow-x-auto">
{`def generate_signal(candle: dict) -> str:
    """
    candle example:
    {
      "open": float,
      "high": float,
      "low": float,
      "close": float,
      "volume": float,
      "timestamp": int
    }
    """

    return "BUY" | "SELL" | "HOLD"`}
        </pre>

        <div className="text-xs text-slate-400">
          The function must return exactly:
          "BUY", "SELL", or "HOLD".
        </div>

      </div>
    </Card>
  );
}