import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

export default function ConfigSpecification() {
  return (
    <Card>
      <SectionTitle title="CONFIG Specification (Spec v2)" />

      <div className="space-y-4 text-sm text-slate-300">

        <p>
          You can optionally define a <code>CONFIG</code> dictionary.
          Only the following fields are allowed.
        </p>

        <pre className="bg-slate-900 p-3 rounded text-xs overflow-x-auto">
{`CONFIG = {
  # Risk
  "max_account_exposure_pct": 100,
  "max_open_positions": 1,
  "max_drawdown_pct": 20,

  # Position sizing
  "batch_size": 1,
  "batch_size_type": "fixed",  # fixed | percent_balance

  # Trade control
  "stop_loss_pct": 2,
  "take_profit_pct": 4,
  "trailing_stop_pct": 1.5,
  "cooldown_seconds": 0,
  "allow_reentry": True,

  # Execution
  "direction": "long_only",  # long_only | long_short
  "order_type": "market",    # market | limit
  "slippage_bps": 5,

  # Strategy Mode
  "signal_mode": "mean_reversion",
}`}
        </pre>

        <div className="text-xs text-slate-400 space-y-1">
          <div>• spec_version must be positive integer</div>
          <div>• max_account_exposure_pct must be 0-100</div>
          <div>• batch_size must be &gt; 0</div>
          <div>• slow_ma_window must be &gt; fast_ma_window</div>
          <div>• RSI thresholds must be 0-100</div>
        </div>

      </div>
    </Card>
  );
}