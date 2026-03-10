import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

export default function EngineRequirements() {
  return (
    <Card>
      <SectionTitle title="Required Strategy Structure" />

      <div className="space-y-4 text-sm text-slate-300">

        <div>
          Every strategy must implement the following function:
        </div>

        <pre className="bg-slate-900 p-3 rounded text-xs overflow-x-auto">
{`def generate_signal(ctx: dict) -> str:
    """
    QuantLab execution context.

    ctx = {
      "candle": {
        "open": float,
        "high": float,
        "low": float,
        "close": float,
        "volume": float,
        "timestamp": int
      },

      # Previous completed candles (no lookahead)
      "history": tuple[dict],

      # Current open position (if any)
      "position": {
        "side": str,
        "quantity": float,
        "entry_price": float,
        "average_entry_price": float,
        "market_value": float,
        "gross_pnl": float,
        "net_pnl": float,
        "realized_pnl": float,
        "unrealized_pnl": float,
        "fees_paid": float,
        "entries_count": int
      } | None,

      # Account state
      "balance": float,
      "initial_balance": float,
      "equity": float,
      "realized_pnl": float,
      "unrealized_pnl": float,
      "open_positions": int,
      "exposure_pct": float,
      "average_entry_price": float | None,
      "current_drawdown_pct": float,

      # Market info
      "exchange": str,
      "symbol": str,
      "timeframe": str,

      # Precomputed indicators
      "indicators": {
        "sma_fast": float
        "sma_slow": float
        "ema_fast": float
        "ema_slow": float
        "rsi": float
        "volatility": float
        "zscore": float
        "atr": float
      }

      # Execution model metadata
      "fee_rate": float,
      "slippage_bps": float,
      "execution_model": str,
      "stop_fill_model": str,
      "leverage": float,
      "margin_mode": str,
      "params": dict,

      # Current bar index
      "index": int,
    }
    """

    return "LONG" | "SHORT" | "CLOSE" | "HOLD"
`}
        </pre>

        <div className="text-xs text-slate-400 space-y-1">

          <div>
            Valid signals:
          </div>

          <div>• <b>LONG</b> → open a long position</div>
          <div>• <b>SHORT</b> → open a short position (requires direction="long_short")</div>
          <div>• <b>CLOSE</b> → close the current open position</div>
          <div>• <b>HOLD</b> → take no action</div>

          <div className="pt-2">
            Legacy aliases (supported for compatibility):
          </div>

          <div>• BUY → LONG</div>
          <div>• SELL → CLOSE (or SHORT if shorting enabled)</div>
          <div>• Backward-compatible top-level OHLCV keys remain available (ctx["close"], etc.)</div>

        </div>

      </div>
    </Card>
  );
}
