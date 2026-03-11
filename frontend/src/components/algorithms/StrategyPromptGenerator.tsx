import { useState } from "react";
import { Card } from "../ui/Card";
import Field from "../ui/Field";
import Button from "../ui/Button";

type StrategyType =
  | "mean_reversion"
  | "momentum"
  | "trend_following"
  | "breakout"
  | "dca";
type IndicatorType = "RSI" | "EMA" | "SMA";

const STRATEGY_TYPES: StrategyType[] = [
  "mean_reversion",
  "momentum",
  "trend_following",
  "breakout",
  "dca",
];

const INDICATORS: IndicatorType[] = ["RSI", "EMA", "SMA"];

export default function StrategyPromptGenerator() {
  const [isOpen, setIsOpen] = useState(true);
  const [strategyType, setStrategyType] = useState<StrategyType>("mean_reversion");
  const [primaryIndicator, setPrimaryIndicator] = useState<IndicatorType>("RSI");
  const [entryCondition, setEntryCondition] = useState("RSI < 30");
  const [exitCondition, setExitCondition] = useState("RSI > 70");
  const [stopLossPct, setStopLossPct] = useState(2);
  const [takeProfitPct, setTakeProfitPct] = useState(4);
  const [positionSizePct, setPositionSizePct] = useState(10);
  const [useDca, setUseDca] = useState(false);
  const [dcaSteps, setDcaSteps] = useState(3);
  const [dcaStepPct, setDcaStepPct] = useState(2);
  const [prompt, setPrompt] = useState("");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  function buildPromptText() {
    const safeStopLoss = Math.max(0, Number(stopLossPct));
    const safeTakeProfit = Math.max(0, Number(takeProfitPct));
    const safePositionSize = Math.max(0.1, Number(positionSizePct));
    const safeDcaSteps = Math.max(1, Number(dcaSteps));
    const safeDcaStepPct = Math.max(0.1, Number(dcaStepPct));

    return `Create a trading algorithm compatible with the QuantLab trading engine.

  The strategy MUST follow the exact structure of the example below.

  You can include a short explanation before the code, but the Python script must be a single continuous block that can be copied and pasted.

  Use only Python standard syntax.
  Do not import external libraries.

  USER STRATEGY PARAMETERS

  strategy_type = ${strategyType}
  primary_indicator = ${primaryIndicator}
  entry_rule = ${entryCondition}
  exit_rule = ${exitCondition}
  stop_loss_pct = ${safeStopLoss}
  take_profit_pct = ${safeTakeProfit}
  position_size_pct = ${safePositionSize}
  dca_enabled = ${useDca}
  dca_steps = ${safeDcaSteps}
  dca_step_pct = ${safeDcaStepPct}

  The engine calls:

  generate_signal(ctx)

  Where ctx contains:

  ctx = {
    "history": list of candles,
    "position": open position or None
  }

  Each candle contains:

  {
    "open": float,
    "high": float,
    "low": float,
    "close": float,
    "volume": float
  }

  The strategy must always return one of:

  LONG
  SHORT
  HOLD
  CLOSE

  Use this exact structure as reference:

  CONFIG = {
      "spec_version": 2,
      "direction": "long_short",
      "lookback_window": 50,
      "min_bars": 50,
      "batch_size_type": "percent_balance",
      "batch_size": ${safePositionSize},
      "max_drawdown_pct": 20,
      "stop_loss_pct": ${safeStopLoss},
      "take_profit_pct": ${safeTakeProfit},
      "trailing_stop_pct": 0.1
  }

  LONG = "LONG"
  SHORT = "SHORT"
  HOLD = "HOLD"
  EXIT = "CLOSE"

  STRATEGY_TYPE = "${strategyType}"
  PRIMARY_INDICATOR = "${primaryIndicator}"

  STOP_LOSS = ${safeStopLoss} / 100.0
  TAKE_PROFIT = ${safeTakeProfit} / 100.0

  POSITION_SIZE = ${safePositionSize}

  def generate_signal(ctx):

      history = ctx["history"]

      if len(history) < 50:
          return HOLD

      closes = []

      for row in history:
          close_val = row.get("close")
          if close_val is not None:
              closes.append(float(close_val))

      if len(closes) < 50:
          return HOLD

      price = closes[-1]

      # strategy logic here

      if entry_condition:
          return LONG

      if exit_condition:
          return EXIT

      return HOLD`;
  }

  function handleGeneratePrompt() {
    setCopyStatus(null);
    setPrompt(buildPromptText());
  }

  async function handleCopyPrompt() {
    if (!prompt.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Prompt copied.");
    } catch {
      setCopyStatus("Copy failed. Please copy manually.");
    }
  }

  return (
    <Card className="space-y-6">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-white text-lg font-semibold">Strategy Prompt Generator</span>
        <span className="text-slate-300 text-sm">{isOpen ? "▼" : "►"}</span>
      </button>

      {!isOpen ? null : (
        <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Field label="Strategy Type">
          <select
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            value={strategyType}
            onChange={(e) => setStrategyType(e.target.value as StrategyType)}
          >
            {STRATEGY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Primary Indicator">
          <select
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            value={primaryIndicator}
            onChange={(e) => setPrimaryIndicator(e.target.value as IndicatorType)}
          >
            {INDICATORS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Field label="Entry Condition">
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            placeholder="RSI < 30"
            value={entryCondition}
            onChange={(e) => setEntryCondition(e.target.value)}
          />
        </Field>
        <Field label="Exit Condition">
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            placeholder="RSI > 70"
            value={exitCondition}
            onChange={(e) => setExitCondition(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Field label="Stop Loss (%)">
          <input
            type="number"
            min={0}
            step="0.1"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            value={stopLossPct}
            onChange={(e) => setStopLossPct(Number(e.target.value))}
          />
        </Field>
        <Field label="Take Profit (%)">
          <input
            type="number"
            min={0}
            step="0.1"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            value={takeProfitPct}
            onChange={(e) => setTakeProfitPct(Number(e.target.value))}
          />
        </Field>
        <Field label="Position Size (% of balance)">
          <input
            type="number"
            min={0.1}
            step="0.1"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            value={positionSizePct}
            onChange={(e) => setPositionSizePct(Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="space-y-4">
        <Field label="Optional Features">
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3">
            <label className="flex items-center justify-between gap-4 text-slate-200 cursor-pointer">
              <span className="text-sm font-medium">Use DCA</span>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={useDca}
                onChange={(e) => setUseDca(e.target.checked)}
              />
            </label>
            <p className="text-xs text-slate-400 mt-2">
              Enable additional entries when price drops by configured DCA steps.
            </p>
          </div>
        </Field>

        {useDca ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="DCA steps">
              <input
                type="number"
                min={1}
                step={1}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                value={dcaSteps}
                onChange={(e) => setDcaSteps(Number(e.target.value))}
              />
            </Field>
            <Field label="DCA step %">
              <input
                type="number"
                min={0.1}
                step="0.1"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                value={dcaStepPct}
                onChange={(e) => setDcaStepPct(Number(e.target.value))}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="PRIMARY" onClick={handleGeneratePrompt}>
          Generate Prompt
        </Button>
        <Button variant="GHOST" onClick={handleCopyPrompt} disabled={!prompt.trim()}>
          Copy Prompt
        </Button>
      </div>

      {copyStatus ? <p className="text-sm text-slate-300">{copyStatus}</p> : null}

      <Field label="Generated Prompt">
        <textarea
          rows={18}
          readOnly
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          value={prompt}
          placeholder="Generate a prompt to see it here."
        />
      </Field>
        </div>
      )}
    </Card>
  );
}
