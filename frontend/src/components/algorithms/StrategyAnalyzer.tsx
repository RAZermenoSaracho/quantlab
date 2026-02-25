import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

interface Props {
  code: string;
}

export default function StrategyAnalyzer({ code }: Props) {

  const hasGenerateSignal = code.includes("def generate_signal");
  const hasConfig = code.includes("CONFIG");
  const hasStopLoss = code.includes("stop_loss_pct");
  const hasTakeProfit = code.includes("take_profit_pct");
  const hasDrawdown = code.includes("max_drawdown_pct");
  const hasWhile = code.includes("while ");
  const hasImport = code.includes("import ");

  function Status({ condition }: { condition: boolean }) {
    return condition ? (
      <CheckCircle className="text-green-500 w-4 h-4" />
    ) : (
      <XCircle className="text-red-500 w-4 h-4" />
    );
  }

  function Warning({ condition }: { condition: boolean }) {
    return condition ? (
      <AlertTriangle className="text-yellow-500 w-4 h-4" />
    ) : null;
  }

  const riskScore =
    (hasStopLoss ? 1 : 0) +
    (hasTakeProfit ? 1 : 0) +
    (hasDrawdown ? 1 : 0);

  return (
    <Card>

      <SectionTitle title="Strategy Analyzer" />

      <div className="space-y-6 text-sm text-slate-300">

        {/* Structure */}
        <div>
          <h4 className="font-semibold text-white mb-2">
            Structure
          </h4>

          <div className="flex justify-between">
            <span>generate_signal(candle)</span>
            <Status condition={hasGenerateSignal} />
          </div>

          <div className="flex justify-between">
            <span>CONFIG defined</span>
            <Status condition={hasConfig} />
          </div>
        </div>

        {/* Risk */}
        <div>
          <h4 className="font-semibold text-white mb-2">
            Risk Management
          </h4>

          <div className="flex justify-between">
            <span>Stop Loss</span>
            <Status condition={hasStopLoss} />
          </div>

          <div className="flex justify-between">
            <span>Take Profit</span>
            <Status condition={hasTakeProfit} />
          </div>

          <div className="flex justify-between">
            <span>Max Drawdown Kill Switch</span>
            <Status condition={hasDrawdown} />
          </div>

          <div className="mt-2 text-xs text-slate-400">
            Risk Score: {riskScore}/3
          </div>
        </div>

        {/* Security */}
        <div>
          <h4 className="font-semibold text-white mb-2">
            Engine Rules
          </h4>

          <div className="flex justify-between">
            <span>No imports</span>
            <Warning condition={hasImport} />
          </div>

          <div className="flex justify-between">
            <span>No while loops</span>
            <Warning condition={hasWhile} />
          </div>

          <div className="text-xs text-slate-400 mt-2">
            QuantLab sandbox blocks:
            • imports
            • while loops
            • exec/eval
            • dunder access
          </div>
        </div>

      </div>
    </Card>
  );
}