import { z } from "zod";
import { CandleSchema, MarketTimeframeSchema } from "./market";
import { EquityPointSchema } from "./portfolio";

/* =========================
   Enums
========================= */

export const BacktestStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);

export type BacktestStatus = z.infer<typeof BacktestStatusSchema>;

/* =========================
   Analysis JSON
========================= */

export const BacktestAnalysisSchema = z.object({
  summary: z
    .object({
      net_profit: z.number().optional(),
      return_pct: z.number().optional(),
      total_trades: z.number().optional(),
      win_rate_percent: z.number().optional(),
      profit_factor: z.number().optional(),
    })
    .optional(),

  risk: z
    .object({
      sharpe: z.number().optional(),
      volatility: z.number().optional(),
      max_drawdown_pct: z.number().optional(),
    })
    .optional(),
}).passthrough();

export type BacktestAnalysis = z.infer<typeof BacktestAnalysisSchema>;

/* =========================
   Entity
========================= */

export const BacktestRunSchema = z.object({
  id: z.string().uuid(),
  algorithm_id: z.string().uuid(),
  algorithm_name: z.string().optional(),

  exchange: z.string(),
  symbol: z.string(),
  timeframe: MarketTimeframeSchema,

  status: BacktestStatusSchema,

  total_return_percent: z.number().nullable().optional(),
  total_return_usdt: z.number().nullable().optional(),
  total_trades: z.number().nullable().optional(),
  win_rate_percent: z.number().nullable().optional(),
  profit_factor: z.number().nullable().optional(),
  sharpe_ratio: z.number().nullable().optional(),

  analysis: BacktestAnalysisSchema.nullable().optional(),

  created_at: z.string(),

  fee_rate: z.number().nullable().optional(),
  initial_balance: z.number().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

export type BacktestRun = z.infer<typeof BacktestRunSchema>;

/* =========================
   Trade
========================= */

export const BacktestTradeSchema = z.object({
  side: z.enum(["LONG", "SHORT"]),
  entry_price: z.number(),
  exit_price: z.number().nullable(),
  quantity: z.number(),
  entry_notional: z.number().nullable().optional(),
  exit_notional: z.number().nullable().optional(),
  entry_fee: z.number().nullable().optional(),
  exit_fee: z.number().nullable().optional(),
  total_fee: z.number().nullable().optional(),
  gross_pnl: z.number().nullable().optional(),
  net_pnl: z.number().nullable().optional(),
  fee_rate_used: z.number().nullable().optional(),
  pnl: z.number(),
  pnl_percent: z.number(),
  opened_at: z.string(),
  closed_at: z.string().nullable(),
  forced_close: z.boolean().optional(),
});

export type BacktestTrade = z.infer<typeof BacktestTradeSchema>;

export const BacktestMetricsSchema = z
  .object({
    total_return_percent: z.number().optional(),
    total_return_usdt: z.number().optional(),
    max_drawdown_percent: z.number().optional(),
    win_rate_percent: z.number().optional(),
    profit_factor: z.number().optional(),
    total_trades: z.number().optional(),
    sharpe_ratio: z.number().optional(),
    volatility: z.number().optional(),
  })
  .passthrough();

export type BacktestMetrics = z.infer<typeof BacktestMetricsSchema>;

export const BacktestAssetHoldingSchema = z.object({
  symbol: z.string(),
  base_asset: z.string().optional(),
  quantity: z.number(),
  last_price: z.number(),
  value_usdt: z.number(),
});

export const BacktestPortfolioSummarySchema = z.object({
  final_cash_balance: z.number().optional(),
  final_asset_holdings: BacktestAssetHoldingSchema.nullable().optional(),
  final_asset_holdings_by_symbol: z.array(BacktestAssetHoldingSchema).optional(),
  average_holding_time_seconds: z.number().optional(),
  average_holding_time_minutes: z.number().optional(),
  exposure_time_seconds: z.number().optional(),
  exposure_time_percent: z.number().optional(),
  time_in_market_percent: z.number().optional(),
  average_capital_utilization_percent: z.number().optional(),
});

export type BacktestPortfolioSummary = z.infer<typeof BacktestPortfolioSummarySchema>;

/* =========================
   Create Backtest
========================= */

export const CreateBacktestRequestSchema = z.object({
  algorithm_id: z.string().uuid(),
  exchange: z.string(),
  symbol: z.string(),
  timeframe: MarketTimeframeSchema,
  initial_balance: z.number().positive(),
  start_date: z.string(),
  end_date: z.string(),
  fee_rate: z.number().optional(),
});

export type CreateBacktestRequest =
  z.infer<typeof CreateBacktestRequestSchema>;

export const StartBacktestRequestSchema = CreateBacktestRequestSchema;

export type StartBacktestRequest =
  z.infer<typeof StartBacktestRequestSchema>;

export const CreateBacktestResponseSchema = z.object({
  run_id: z.string().uuid(),
});

export type CreateBacktestResponse =
  z.infer<typeof CreateBacktestResponseSchema>;

export const StartBacktestResponseSchema = CreateBacktestResponseSchema;

export type StartBacktestResponse =
  z.infer<typeof StartBacktestResponseSchema>;

/* =========================
   List Response
========================= */

export const BacktestsListResponseSchema = z.object({
  backtests: z.array(BacktestRunSchema),
});

export type BacktestsListResponse = z.infer<
  typeof BacktestsListResponseSchema
>;

/* =========================
   Backtest Status
========================= */

export const BacktestStatusResponseSchema = z.object({
  status: BacktestStatusSchema,
  progress: z.number(),
});

export type BacktestStatusResponse =
  z.infer<typeof BacktestStatusResponseSchema>;

/* =========================
   Backtest Detail
========================= */

export const BacktestDetailResponseSchema = z.object({
  run: BacktestRunSchema,

  metrics: BacktestMetricsSchema.nullable(),

  analysis: BacktestAnalysisSchema.nullable(),

  trades: z.array(BacktestTradeSchema),

  equity_curve: z.array(EquityPointSchema),

  candles: z.array(CandleSchema),

  candles_count: z.number(),

  candles_start_ts: z.number().nullable(),

  candles_end_ts: z.number().nullable(),

  open_positions_at_end: z.number(),

  had_forced_close: z.boolean(),

  portfolio_summary: BacktestPortfolioSummarySchema.nullable().optional(),
});

export type BacktestDetailResponse = z.infer<
  typeof BacktestDetailResponseSchema
>;
