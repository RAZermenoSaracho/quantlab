import { useEffect, useMemo, useState } from "react";
import { Card } from "../ui/Card";
import Field from "../ui/Field";
import Button from "../ui/Button";

type StrategyType = "mean_reversion" | "momentum" | "trend_following" | "dca";
type IndicatorType = "RSI" | "EMA" | "SMA";
type RuleOperator = ">" | "<" | ">=" | "<=";
type StrategyTemplate =
  | "rsi_mean_reversion"
  | "ema_crossover"
  | "ema_trend_following"
  | "rsi_trend_filter"
  | "momentum_breakout"
  | "dca_dip_buying"
  | "custom";
type ParameterPreset = "conservative" | "balanced" | "aggressive" | "custom";

type RuleConfig = {
  indicator: IndicatorType;
  operator: RuleOperator;
  value: number;
};

type Props = {
  onGenerate: (code: string) => void;
};

const STRATEGY_OPTIONS: StrategyType[] = [
  "mean_reversion",
  "momentum",
  "trend_following",
  "dca",
];
const TEMPLATE_OPTIONS: StrategyTemplate[] = [
  "rsi_mean_reversion",
  "ema_crossover",
  "ema_trend_following",
  "rsi_trend_filter",
  "momentum_breakout",
  "dca_dip_buying",
  "custom",
];
const PRESET_OPTIONS: ParameterPreset[] = [
  "conservative",
  "balanced",
  "aggressive",
  "custom",
];
const INDICATOR_OPTIONS: IndicatorType[] = ["RSI", "EMA", "SMA"];
const OPERATOR_OPTIONS: RuleOperator[] = [">", "<", ">=", "<="];

function makeCondition(signalVar: string, rule: RuleConfig): string {
  return `${signalVar} ${rule.operator} ${Number(rule.value)}`;
}

function presetDefaults(preset: ParameterPreset): {
  stopLossPct: number;
  takeProfitPct: number;
  positionSizePct: number;
} {
  if (preset === "conservative") {
    return { stopLossPct: 1, takeProfitPct: 2, positionSizePct: 5 };
  }
  if (preset === "aggressive") {
    return { stopLossPct: 5, takeProfitPct: 10, positionSizePct: 20 };
  }
  return { stopLossPct: 2, takeProfitPct: 4, positionSizePct: 10 };
}

function templateLabel(template: StrategyTemplate): string {
  if (template === "rsi_mean_reversion") return "RSI Mean Reversion";
  if (template === "ema_crossover") return "EMA Crossover";
  if (template === "ema_trend_following") return "EMA Trend Following";
  if (template === "rsi_trend_filter") return "RSI Trend Filter";
  if (template === "momentum_breakout") return "Momentum Breakout";
  if (template === "dca_dip_buying") return "DCA Dip Buying";
  return "Custom";
}

export default function StrategyBuilder({ onGenerate }: Props) {
  const [isOpen, setIsOpen] = useState(true);

  const [strategyTemplate, setStrategyTemplate] = useState<StrategyTemplate>("rsi_mean_reversion");
  const [parameterPreset, setParameterPreset] = useState<ParameterPreset>("balanced");

  const [strategyType, setStrategyType] = useState<StrategyType>("momentum");
  const [indicator, setIndicator] = useState<IndicatorType>("RSI");

  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [emaFastPeriod, setEmaFastPeriod] = useState(12);
  const [emaSlowPeriod, setEmaSlowPeriod] = useState(26);
  const [smaFastPeriod, setSmaFastPeriod] = useState(10);
  const [smaSlowPeriod, setSmaSlowPeriod] = useState(30);

  const [entryRule, setEntryRule] = useState<RuleConfig>({
    indicator: "RSI",
    operator: "<",
    value: 30,
  });
  const [exitRule, setExitRule] = useState<RuleConfig>({
    indicator: "RSI",
    operator: ">",
    value: 70,
  });

  const [stopLossPct, setStopLossPct] = useState(2.0);
  const [takeProfitPct, setTakeProfitPct] = useState(4.0);
  const [trailingStopPct, setTrailingStopPct] = useState(0.0);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(20.0);

  const [positionSizePct, setPositionSizePct] = useState(10.0);
  const [dcaEnabled, setDcaEnabled] = useState(false);
  const [dcaSteps, setDcaSteps] = useState(3);
  const [dcaStepPct, setDcaStepPct] = useState(2.0);
  const isPresetLocked = parameterPreset !== "custom";

  useEffect(() => {
    if (parameterPreset === "custom") {
      return;
    }
    const defaults = presetDefaults(parameterPreset);
    setStopLossPct(defaults.stopLossPct);
    setTakeProfitPct(defaults.takeProfitPct);
    setPositionSizePct(defaults.positionSizePct);
  }, [parameterPreset]);

  useEffect(() => {
    if (strategyTemplate === "rsi_mean_reversion") {
      setIndicator("RSI");
      setStrategyType("mean_reversion");
      return;
    }
    if (strategyTemplate === "ema_crossover") {
      setIndicator("EMA");
      setStrategyType("momentum");
      return;
    }
    if (strategyTemplate === "ema_trend_following") {
      setIndicator("EMA");
      setStrategyType("trend_following");
      return;
    }
    if (strategyTemplate === "rsi_trend_filter") {
      setIndicator("RSI");
      setStrategyType("trend_following");
      return;
    }
    if (strategyTemplate === "momentum_breakout") {
      setIndicator("EMA");
      setStrategyType("momentum");
      return;
    }
    if (strategyTemplate === "dca_dip_buying") {
      setStrategyType("dca");
    }
  }, [strategyTemplate]);

  const strategyParameters = useMemo(
    () => ({
      rsiPeriod,
      emaFastPeriod,
      emaSlowPeriod,
      smaFastPeriod,
      smaSlowPeriod,
      stopLossPct,
      takeProfitPct,
      trailingStopPct,
      maxDrawdownPct,
      positionSizePct,
      dcaEnabled,
      dcaSteps,
      dcaStepPct,
    }),
    [
      rsiPeriod,
      emaFastPeriod,
      emaSlowPeriod,
      smaFastPeriod,
      smaSlowPeriod,
      stopLossPct,
      takeProfitPct,
      trailingStopPct,
      maxDrawdownPct,
      positionSizePct,
      dcaEnabled,
      dcaSteps,
      dcaStepPct,
    ]
  );

  const minBars = useMemo(() => {
    const indicatorBars = Math.max(
      rsiPeriod + 2,
      emaSlowPeriod + 2,
      smaSlowPeriod + 2
    );
    return Math.max(50, indicatorBars);
  }, [rsiPeriod, emaSlowPeriod, smaSlowPeriod]);

  function handleGenerate() {
    const safeRsi = Math.max(2, Number(strategyParameters.rsiPeriod));
    const safeEmaFast = Math.max(2, Number(strategyParameters.emaFastPeriod));
    const safeEmaSlow = Math.max(safeEmaFast + 1, Number(strategyParameters.emaSlowPeriod));
    const safeSmaFast = Math.max(2, Number(strategyParameters.smaFastPeriod));
    const safeSmaSlow = Math.max(safeSmaFast + 1, Number(strategyParameters.smaSlowPeriod));

    const safePositionPct = Math.min(100, Math.max(0.1, Number(strategyParameters.positionSizePct)));
    const safeStopLoss = Math.max(0, Number(strategyParameters.stopLossPct));
    const safeTakeProfit = Math.max(0, Number(strategyParameters.takeProfitPct));
    const safeTrailing = Math.max(0, Number(strategyParameters.trailingStopPct));
    const safeMaxDD = Math.max(0, Number(strategyParameters.maxDrawdownPct));
    const safeDcaSteps = Math.max(1, Math.floor(Number(strategyParameters.dcaSteps)));
    const safeDcaStep = Math.max(0.1, Number(strategyParameters.dcaStepPct));

    const entryExpr = makeCondition(
      `entry_signal_${entryRule.indicator.toLowerCase()}`,
      entryRule
    );
    const exitExpr = makeCondition(
      `exit_signal_${exitRule.indicator.toLowerCase()}`,
      exitRule
    );

    const selectedTemplate = strategyTemplate;
    const effectiveStrategyType: StrategyType = (() => {
      if (selectedTemplate === "rsi_mean_reversion") return "mean_reversion";
      if (selectedTemplate === "ema_crossover" || selectedTemplate === "momentum_breakout") return "momentum";
      if (selectedTemplate === "ema_trend_following" || selectedTemplate === "rsi_trend_filter") return "trend_following";
      if (selectedTemplate === "dca_dip_buying") return "dca";
      return strategyType;
    })();

    const templateLogicBlock = (() => {
      if (selectedTemplate === "rsi_mean_reversion") {
        return `
    entry_condition = rsi < ENTRY_RSI
    exit_condition = rsi > EXIT_RSI
`;
      }
      if (selectedTemplate === "ema_crossover") {
        return `
    entry_condition = ema_fast > ema_slow
    exit_condition = ema_fast < ema_slow
`;
      }
      if (selectedTemplate === "ema_trend_following") {
        return `
    entry_condition = ema_fast > ema_slow
    exit_condition = price < ema_fast
`;
      }
      if (selectedTemplate === "rsi_trend_filter") {
        return `
    entry_condition = rsi < ENTRY_RSI and ema_fast > ema_slow
    exit_condition = rsi > EXIT_RSI or ema_fast < ema_slow
`;
      }
      if (selectedTemplate === "momentum_breakout") {
        return `
    breakout_window = 20
    window = highs[-breakout_window:] if len(highs) >= breakout_window else highs
    recent_high = max(window)
    entry_condition = price > recent_high
    exit_condition = price < ema_fast
`;
      }
      if (selectedTemplate === "dca_dip_buying") {
        return `
    entry_condition = (position is None) and (ema_fast >= ema_slow)
    exit_condition = price >= ema_fast * (1.0 + TAKE_PROFIT) if TAKE_PROFIT > 0 else False
`;
      }
      return `
    entry_condition = (${entryExpr})
    exit_condition = (${exitExpr})
`;
    })();

    const code = `CONFIG = {
    "spec_version": 2,
    "direction": "long_short",
    "lookback_window": ${minBars},
    "min_bars": ${minBars},
    "batch_size_type": "percent_balance",
    "batch_size": ${safePositionPct},
    "max_drawdown_pct": ${safeMaxDD},
    "stop_loss_pct": ${safeStopLoss},
    "take_profit_pct": ${safeTakeProfit},
    "trailing_stop_pct": ${safeTrailing}
}

LONG = "LONG"
SHORT = "SHORT"
HOLD = "HOLD"
EXIT = "CLOSE"

STRATEGY_TYPE = "${effectiveStrategyType}"
PRIMARY_INDICATOR = "${indicator}"
STRATEGY_TEMPLATE = "${selectedTemplate}"

RSI_PERIOD = ${safeRsi}
EMA_FAST_PERIOD = ${safeEmaFast}
EMA_SLOW_PERIOD = ${safeEmaSlow}
SMA_FAST_PERIOD = ${safeSmaFast}
SMA_SLOW_PERIOD = ${safeSmaSlow}

STOP_LOSS = ${safeStopLoss} / 100.0
TAKE_PROFIT = ${safeTakeProfit} / 100.0
TRAILING_STOP = ${safeTrailing} / 100.0
MAX_DRAWDOWN = ${safeMaxDD}

POSITION_SIZE = ${safePositionPct}
DCA_ENABLED = ${strategyParameters.dcaEnabled ? "True" : "False"}
DCA_STEPS = ${safeDcaSteps}
DCA_STEP = ${safeDcaStep} / 100.0
ENTRY_RSI = ${Number(entryRule.value)}
EXIT_RSI = ${Number(exitRule.value)}

def _sma(values, period):
    p = max(1, int(period))
    if len(values) < p:
        return values[-1] if values else 0.0
    return sum(values[-p:]) / float(p)

def _ema(values, period):
    p = max(1, int(period))
    if not values:
        return 0.0
    alpha = 2.0 / (p + 1.0)
    out = float(values[0])
    for value in values[1:]:
        out = alpha * float(value) + (1.0 - alpha) * out
    return out

def _rsi(values, period):
    p = max(2, int(period))
    if len(values) <= p:
        return 50.0
    gains = []
    losses = []
    start = len(values) - p
    for i in range(start, len(values)):
        prev_val = float(values[i - 1])
        cur_val = float(values[i])
        delta = cur_val - prev_val
        if delta >= 0:
            gains.append(delta)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(-delta)
    avg_gain = (sum(gains) / float(p)) if gains else 0.0
    avg_loss = (sum(losses) / float(p)) if losses else 0.0
    if avg_loss <= 1e-12:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))

def _signal_value(indicator_name, closes):
    name = str(indicator_name).upper()
    if name == "RSI":
        return _rsi(closes, RSI_PERIOD)
    if name == "EMA":
        fast = _ema(closes, EMA_FAST_PERIOD)
        slow = _ema(closes, EMA_SLOW_PERIOD)
        if abs(slow) <= 1e-12:
            return 0.0
        return ((fast - slow) / slow) * 100.0
    fast = _sma(closes, SMA_FAST_PERIOD)
    slow = _sma(closes, SMA_SLOW_PERIOD)
    if abs(slow) <= 1e-12:
        return 0.0
    return ((fast - slow) / slow) * 100.0

def generate_signal(ctx):
    history = list(ctx["history"])
    if len(history) < ${minBars}:
        return HOLD

    closes = []
    for row in history:
        close_val = row.get("close")
        if close_val is not None:
            closes.append(float(close_val))

    if len(closes) < ${minBars}:
        return HOLD

    price = float(closes[-1])
    highs = [float(row.get("high", price)) for row in history]
    position = ctx.get("position")
    drawdown = float(ctx.get("drawdown", ctx.get("current_drawdown_pct", 0.0)))

    if drawdown > MAX_DRAWDOWN:
        return EXIT

    if position:
        entry_price = float(position.get("average_entry_price", position.get("entry_price", price)))
        if STOP_LOSS > 0 and price <= entry_price * (1.0 - STOP_LOSS):
            return EXIT
        if TAKE_PROFIT > 0 and price >= entry_price * (1.0 + TAKE_PROFIT):
            return EXIT

    rsi = _signal_value("RSI", closes)
    ema_fast = _ema(closes, EMA_FAST_PERIOD)
    ema_slow = _ema(closes, EMA_SLOW_PERIOD)
    sma_fast = _sma(closes, SMA_FAST_PERIOD)
    sma_slow = _sma(closes, SMA_SLOW_PERIOD)

    entry_signal_rsi = rsi
    entry_signal_ema = ((ema_fast - ema_slow) / ema_slow) * 100.0 if abs(ema_slow) > 1e-12 else 0.0
    entry_signal_sma = ((sma_fast - sma_slow) / sma_slow) * 100.0 if abs(sma_slow) > 1e-12 else 0.0

    exit_signal_rsi = rsi
    exit_signal_ema = entry_signal_ema
    exit_signal_sma = entry_signal_sma
${templateLogicBlock}

    if position and DCA_ENABLED and STRATEGY_TYPE in ("dca", "mean_reversion", "trend_following"):
        entries_count = int(position.get("entries_count", 1))
        if entries_count < DCA_STEPS:
            dca_trigger = entry_price * (1.0 - (entries_count * DCA_STEP))
            if price <= dca_trigger:
                return LONG

    if STRATEGY_TYPE == "mean_reversion":
        if entry_condition:
            return LONG
        if exit_condition:
            return EXIT
        return HOLD

    if STRATEGY_TYPE == "momentum":
        if entry_condition:
            return LONG
        if exit_condition:
            return SHORT
        return HOLD

    if STRATEGY_TYPE == "trend_following":
        if entry_condition:
            return LONG
        if exit_condition:
            return EXIT
        return HOLD

    if entry_condition:
        return LONG
    if exit_condition:
        return EXIT
    return HOLD
`;

    onGenerate(code);
  }

  const preview = useMemo(() => {
    let entryText = `${entryRule.indicator} ${entryRule.operator} ${entryRule.value}`;
    let exitText = `${exitRule.indicator} ${exitRule.operator} ${exitRule.value}`;

    if (strategyTemplate === "rsi_mean_reversion") {
      entryText = `RSI < ${entryRule.value}`;
      exitText = `RSI > ${exitRule.value}`;
    } else if (strategyTemplate === "ema_crossover") {
      entryText = "EMA fast > EMA slow";
      exitText = "EMA fast < EMA slow";
    } else if (strategyTemplate === "ema_trend_following") {
      entryText = "EMA fast > EMA slow";
      exitText = "Price < EMA fast";
    } else if (strategyTemplate === "rsi_trend_filter") {
      entryText = `RSI < ${entryRule.value} AND EMA fast > EMA slow`;
      exitText = `RSI > ${exitRule.value} OR EMA fast < EMA slow`;
    } else if (strategyTemplate === "momentum_breakout") {
      entryText = "Price > recent highest high (20 bars)";
      exitText = "Price < EMA fast";
    } else if (strategyTemplate === "dca_dip_buying") {
      entryText = "Initial LONG in trend + additional LONG on dip steps";
      exitText = "Exit on risk/TP conditions";
    }

    return {
      entryText,
      exitText,
    };
  }, [strategyTemplate, entryRule, exitRule]);

  return (
    <Card className="space-y-5">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-white text-lg font-semibold">Strategy Builder</span>
        <span className="text-slate-300 text-sm">{isOpen ? "▼" : "►"}</span>
      </button>

      {!isOpen ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="Strategy Template">
              <select
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                value={strategyTemplate}
                onChange={(e) => setStrategyTemplate(e.target.value as StrategyTemplate)}
              >
                {TEMPLATE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {templateLabel(option)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Parameter Preset">
              <select
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                value={parameterPreset}
                onChange={(e) => {
                  const value = e.target.value.trim() as ParameterPreset;
                  setParameterPreset(value);
                }}
              >
                {PRESET_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-200">Strategy Logic</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="Strategy Type">
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={strategyType}
                  onChange={(e) => setStrategyType(e.target.value as StrategyType)}
                  disabled={strategyTemplate !== "custom"}
                >
                  {STRATEGY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Primary Indicator">
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={indicator}
                  onChange={(e) => setIndicator(e.target.value as IndicatorType)}
                >
                  {INDICATOR_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <Field label="RSI period">
                <input
                  type="number"
                  min={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={rsiPeriod}
                  onChange={(e) => setRsiPeriod(Number(e.target.value))}
                />
              </Field>
              <Field label="EMA fast period">
                <input
                  type="number"
                  min={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={emaFastPeriod}
                  onChange={(e) => setEmaFastPeriod(Number(e.target.value))}
                />
              </Field>
              <Field label="EMA slow period">
                <input
                  type="number"
                  min={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={emaSlowPeriod}
                  onChange={(e) => setEmaSlowPeriod(Number(e.target.value))}
                />
              </Field>
              <Field label="SMA fast period">
                <input
                  type="number"
                  min={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={smaFastPeriod}
                  onChange={(e) => setSmaFastPeriod(Number(e.target.value))}
                />
              </Field>
              <Field label="SMA slow period">
                <input
                  type="number"
                  min={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={smaSlowPeriod}
                  onChange={(e) => setSmaSlowPeriod(Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h5 className="text-sm font-semibold text-slate-300">Entry rule</h5>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white"
                    value={entryRule.indicator}
                    onChange={(e) =>
                      setEntryRule((prev) => ({ ...prev, indicator: e.target.value as IndicatorType }))
                    }
                    disabled={strategyTemplate !== "custom"}
                  >
                    {INDICATOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white"
                    value={entryRule.operator}
                    onChange={(e) =>
                      setEntryRule((prev) => ({ ...prev, operator: e.target.value as RuleOperator }))
                    }
                    disabled={strategyTemplate !== "custom"}
                  >
                    {OPERATOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white"
                    value={entryRule.value}
                    onChange={(e) =>
                      setEntryRule((prev) => ({ ...prev, value: Number(e.target.value) }))
                    }
                    disabled={strategyTemplate !== "custom"}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h5 className="text-sm font-semibold text-slate-300">Exit rule</h5>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white"
                    value={exitRule.indicator}
                    onChange={(e) =>
                      setExitRule((prev) => ({ ...prev, indicator: e.target.value as IndicatorType }))
                    }
                    disabled={strategyTemplate !== "custom"}
                  >
                    {INDICATOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white"
                    value={exitRule.operator}
                    onChange={(e) =>
                      setExitRule((prev) => ({ ...prev, operator: e.target.value as RuleOperator }))
                    }
                    disabled={strategyTemplate !== "custom"}
                  >
                    {OPERATOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white"
                    value={exitRule.value}
                    onChange={(e) =>
                      setExitRule((prev) => ({ ...prev, value: Number(e.target.value) }))
                    }
                    disabled={strategyTemplate !== "custom"}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-200">Risk Management</h4>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <Field label="Stop Loss (%)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={stopLossPct}
                  onChange={(e) => {
                    if (parameterPreset !== "custom") {
                      setParameterPreset("custom");
                    }
                    setStopLossPct(Number(e.target.value));
                  }}
                  disabled={isPresetLocked}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Automatically closes the position if price drops by this percentage from entry.
                </p>
              </Field>
              <Field label="Take Profit (%)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={takeProfitPct}
                  onChange={(e) => {
                    if (parameterPreset !== "custom") {
                      setParameterPreset("custom");
                    }
                    setTakeProfitPct(Number(e.target.value));
                  }}
                  disabled={isPresetLocked}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Automatically exits the trade when the profit target is reached.
                </p>
              </Field>
              <Field label="Trailing Stop (%)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={trailingStopPct}
                  onChange={(e) => setTrailingStopPct(Number(e.target.value))}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Moves the stop loss upward as the trade becomes profitable.
                </p>
              </Field>
              <Field label="Max Drawdown Kill Switch (%)">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={maxDrawdownPct}
                  onChange={(e) => setMaxDrawdownPct(Number(e.target.value))}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Stops trading if strategy drawdown exceeds this percentage.
                </p>
              </Field>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-200">Position Management</h4>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <Field label="Position Size (% of balance)">
                <input
                  type="number"
                  min={0.1}
                  max={100}
                  step="0.1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={positionSizePct}
                  onChange={(e) => {
                    if (parameterPreset !== "custom") {
                      setParameterPreset("custom");
                    }
                    setPositionSizePct(Number(e.target.value));
                  }}
                  disabled={isPresetLocked}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Percentage of total account balance allocated per trade.
                </p>
              </Field>
              <Field label="DCA enabled">
                <div className="flex items-center mt-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={dcaEnabled}
                    onChange={(e) => setDcaEnabled(e.target.checked)}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-7">
                  Allows additional entries as price drops.
                </p>
              </Field>
              <Field label="DCA steps">
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={dcaSteps}
                  onChange={(e) => setDcaSteps(Number(e.target.value))}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Maximum number of additional DCA entries.
                </p>
              </Field>
              <Field label="DCA step size (%)">
                <input
                  type="number"
                  min={0.1}
                  step="0.1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  value={dcaStepPct}
                  onChange={(e) => setDcaStepPct(Number(e.target.value))}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Percentage drop between each DCA entry.
                </p>
              </Field>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-200">Strategy Preview</h4>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-sm">
              <div>
                <div className="text-slate-400">Template</div>
                <div className="text-slate-100">{templateLabel(strategyTemplate)}</div>
              </div>
              <div>
                <div className="text-slate-400">Primary Indicator</div>
                <div className="text-slate-100">{indicator}</div>
              </div>
              <div>
                <div className="text-slate-400">Entry rule</div>
                <div className="text-slate-100">{preview.entryText}</div>
              </div>
              <div>
                <div className="text-slate-400">Exit rule</div>
                <div className="text-slate-100">{preview.exitText}</div>
              </div>
              <div>
                <div className="text-slate-400">Risk management</div>
                <div className="text-slate-100">
                  Stop loss: {stopLossPct}% | Take profit: {takeProfitPct}% | Trailing: {trailingStopPct}% | Max DD: {maxDrawdownPct}%
                </div>
              </div>
              <div>
                <div className="text-slate-400">Position management</div>
                <div className="text-slate-100">
                  {positionSizePct}% of balance
                  {dcaEnabled ? ` | DCA ${dcaSteps} steps every ${dcaStepPct}% drop` : " | DCA disabled"}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button variant="PRIMARY" onClick={handleGenerate}>
              Generate Strategy
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
