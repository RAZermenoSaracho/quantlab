import { z } from "zod";
import { CandleSchema, EquityPointSchema } from "./market";

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
});

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
  timeframe: z.string(),

  status: BacktestStatusSchema,

  total_return_percent: z.number().nullable().optional(),
  total_return_usdt: z.number().nullable().optional(),
  total_trades: z.number().nullable().optional(),
  win_rate_percent: z.number().nullable().optional(),
  profit_factor: z.number().nullable().optional(),

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

/* =========================
   Create Backtest
========================= */

export const CreateBacktestRequestSchema = z.object({
  algorithm_id: z.string().uuid(),
  exchange: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  initial_balance: z.number().positive(),
  start_date: z.string(),
  end_date: z.string(),
  fee_rate: z.number().optional(),
});

export type CreateBacktestRequest =
  z.infer<typeof CreateBacktestRequestSchema>;

export const CreateBacktestResponseSchema = z.object({
  run_id: z.string().uuid(),
});

export type CreateBacktestResponse =
  z.infer<typeof CreateBacktestResponseSchema>;

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
});

export type BacktestDetailResponse = z.infer<
  typeof BacktestDetailResponseSchema
>;
