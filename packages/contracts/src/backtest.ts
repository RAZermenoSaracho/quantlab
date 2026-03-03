import { z } from "zod";

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
   DTO
========================= */

export const CreateBacktestSchema = z.object({
  algorithm_id: z.string().uuid(),
  exchange: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  initial_balance: z.number(),
  start_date: z.string(),
  end_date: z.string(),
  fee_rate: z.number().optional(),
});

export type CreateBacktestDto = z.infer<typeof CreateBacktestSchema>;

/* =========================
   Responses
========================= */

export const BacktestsListResponseSchema = z.object({
  backtests: z.array(BacktestRunSchema),
});

export type BacktestsListResponse = z.infer<
  typeof BacktestsListResponseSchema
>;

/* =========================
   Backtest Detail Response
========================= */

export const BacktestDetailResponseSchema = z.object({
  run: BacktestRunSchema,
  metrics: z.any().nullable(),
  analysis: BacktestAnalysisSchema.nullable(),
  trades: z.array(z.any()),
  equity_curve: z.array(z.any()),
  candles: z.array(z.any()),
  candles_count: z.number(),
  candles_start_ts: z.number().nullable(),
  candles_end_ts: z.number().nullable(),
  open_positions_at_end: z.number(),
  had_forced_close: z.boolean(),
});

export type BacktestDetailResponse = z.infer<
  typeof BacktestDetailResponseSchema
>;