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
      "position": dict | None,

      # Account state
      "balance": float
      "initial_balance": float

      # Market info
      "timeframe": str

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

      # Current bar index
      "index": int
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

        </div>

      </div>
    </Card>
  );
}