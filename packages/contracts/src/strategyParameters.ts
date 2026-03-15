export const STRATEGY_PARAMETER_TYPES = ["number"] as const;
export type StrategyParameterType = (typeof STRATEGY_PARAMETER_TYPES)[number];

export type StrategyParameterDefinition = {
  type: StrategyParameterType;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

export const STRATEGY_PARAMETERS = {
  ema_fast: {
    type: "number",
    description: "Fast EMA period",
    min: 2,
    max: 100,
    step: (100 - 2) / 20,
    default: 21,
  },
  ema_slow: {
    type: "number",
    description: "Slow EMA period",
    min: 5,
    max: 300,
    step: (300 - 5) / 20,
    default: 89,
  },
  ema_signal: {
    type: "number",
    description: "Signal EMA period for EMA-based momentum filters",
    min: 2,
    max: 100,
    step: (100 - 2) / 20,
    default: 9,
  },
  rsi_period: {
    type: "number",
    description: "RSI lookback period",
    min: 2,
    max: 50,
    step: (50 - 2) / 20,
    default: 14,
  },
  rsi_buy_level: {
    type: "number",
    description: "RSI threshold used for long entries",
    min: 5,
    max: 50,
    step: (50 - 5) / 20,
    default: 30,
  },
  rsi_sell_level: {
    type: "number",
    description: "RSI threshold used for exits or short entries",
    min: 50,
    max: 95,
    step: (95 - 50) / 20,
    default: 70,
  },
  atr_period: {
    type: "number",
    description: "ATR lookback period",
    min: 2,
    max: 100,
    step: (100 - 2) / 20,
    default: 14,
  },
  atr_min_pct: {
    type: "number",
    description: "Minimum ATR as percent of price required to trade",
    min: 0,
    max: 10,
    step: (10 - 0) / 20,
    default: 0.5,
  },
  dip_threshold_pct: {
    type: "number",
    description: "Percent dip threshold used for dip-buying logic",
    min: 0.1,
    max: 30,
    step: (30 - 0.1) / 20,
    default: 2,
  },
  entry_size_pct: {
    type: "number",
    description: "Position size as percent of balance",
    min: 1,
    max: 100,
    step: 5,
    default: 10,
  },
  base_position_pct: {
    type: "number",
    description: "Base position size as percent of balance",
    min: 0.5,
    max: 100,
    step: (100 - 0.5) / 20,
    default: 5,
  },
  take_profit_pct: {
    type: "number",
    description: "Take-profit target as percent from entry",
    min: 0.1,
    max: 50,
    step: (50 - 0.1) / 20,
    default: 4,
  },
  stop_loss_pct: {
    type: "number",
    description: "Stop-loss threshold as percent from entry",
    min: 0.1,
    max: 30,
    step: (30 - 0.1) / 20,
    default: 2,
  },
  max_exposure_pct: {
    type: "number",
    description: "Maximum account exposure allowed at one time",
    min: 1,
    max: 100,
    step: (100 - 1) / 20,
    default: 25,
  },
  return_thresh: {
    type: "number",
    description: "Return threshold used for signal logic",
    min: -0.02,
    max: 0.02,
    step: 0.005,
    default: 0,
  },
  volume_low: {
    type: "number",
    description: "Lower bound of volume change",
    min: -10,
    max: 0,
    step: (0 - -10) / 20,
    default: -3,
  },
  volume_high: {
    type: "number",
    description: "Upper bound of volume change",
    min: 0,
    max: 10,
    step: (10 - 0) / 20,
    default: 3,
  },
  min_edge_bps: {
    type: "number",
    description: "Minimum edge in basis points required before exiting",
    min: 0,
    max: 50,
    step: (50 - 0) / 20,
    default: 8,
  },
} as const satisfies Record<string, StrategyParameterDefinition>;

export type StrategyParameterKey = keyof typeof STRATEGY_PARAMETERS;
