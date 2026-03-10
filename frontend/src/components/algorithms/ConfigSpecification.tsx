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
  "spec_version": 2,

  # Risk
  "max_account_exposure_pct": 100,
  "max_open_positions": 1,
  "max_drawdown_pct": 20,  # optional

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
  "order_type": "market",    # market | limit | stop | stop_limit
  "slippage_bps": 5,
  "execution_model": "next_open",      # next_open | same_close
  "stop_fill_model": "stop_price",     # stop_price | worst_case
  "leverage": 1.0,                     # 1 - 125
  "margin_mode": "isolated",           # isolated | cross

  # Strategy mode / windows
  "signal_mode": "mean_reversion",
  "min_bars": 30,
  "lookback_window": 20,
  "volume_window": 20,
  "volatility_window": 20,
  "fast_ma_window": 10,
  "slow_ma_window": 50,
  "rsi_window": 14,

  # Threshold family
  "return_threshold_pct": -1.0,
  "exit_return_threshold_pct": 1.0,
  "volume_spike_threshold_pct": 20.0,
  "zscore_entry_threshold": -1.5,
  "zscore_exit_threshold": 0.0,
  "volatility_breakout_pct": 2.0,
  "rsi_entry_threshold": 30.0,
  "rsi_exit_threshold": 60.0,

  # Optional filters
  "trend_filter": False,
  "require_volume_confirmation": True,
  "require_return_confirmation": True,

  # Custom strategy parameters (optional)
  "params": {
    "dca_drop_pct": 1.5,
    "max_dca_entries": 5,
    "net_take_profit_pct": 1.2
  }
}`}
        </pre>

        <div className="text-xs text-slate-400 space-y-1">
          <div>• spec_version must be positive integer</div>
          <div>• max_account_exposure_pct must be 0-100</div>
          <div>• batch_size must be &gt; 0</div>
          <div>• allow_reentry controls immediate re-entry after close</div>
          <div>• params accepts only safe literal values (number/string/bool/null)</div>
          <div>• generate_signal can return strings (LONG/SHORT/CLOSE/HOLD, BUY/SELL) or structured orders</div>
          <div>• structured order_type supports market, limit, stop and stop_limit</div>
          <div>• slippage_bps, fee_rate, execution_model and stop_fill_model are exposed in ctx</div>
          <div>• slow_ma_window must be &gt; fast_ma_window</div>
          <div>• RSI thresholds must be 0-100</div>
        </div>

      </div>
    </Card>
  );
}
