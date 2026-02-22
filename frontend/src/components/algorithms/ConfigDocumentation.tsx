import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";

export default function ConfigDocumentation() {
  return (
    <Card>
      <SectionTitle title="Strategy CONFIG Variables" />

      <div className="space-y-4 text-sm text-gray-700">

        <p>
          You can optionally define a <code>CONFIG</code> object in your
          strategy to control risk and execution behavior.
        </p>

        <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`CONFIG = {
  "max_account_exposure_pct": 100,
  "max_open_positions": 1,
  "batch_size": 1,
  "batch_size_type": "fixed",  # fixed | percent_balance
  "stop_loss_pct": 2,
  "take_profit_pct": 4,
  "cooldown_seconds": 0,
  "max_drawdown_pct": 20
}`}
        </pre>

        <div className="space-y-2">

          <div>
            <strong>max_account_exposure_pct</strong> – Maximum percentage of initial capital the strategy can use.
          </div>

          <div>
            <strong>batch_size</strong> – Position size per trade.
          </div>

          <div>
            <strong>batch_size_type</strong> – 
            <code>"fixed"</code> uses exact units, 
            <code>"percent_balance"</code> uses % of current balance.
          </div>

          <div>
            <strong>stop_loss_pct</strong> – Auto close trade if loss reaches %.
          </div>

          <div>
            <strong>take_profit_pct</strong> – Auto close trade at profit %.
          </div>

          <div>
            <strong>cooldown_seconds</strong> – Delay between trades.
          </div>

          <div>
            <strong>max_drawdown_pct</strong> – Kill switch if equity drawdown exceeds %.
          </div>

        </div>

      </div>
    </Card>
  );
}
