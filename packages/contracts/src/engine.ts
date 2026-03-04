import { z } from "zod";
import { ApiResponseSchema, ApiSuccessSchema } from "./common";
import { BacktestAnalysisSchema } from "./backtest";
import { CandleSchema, EquityPointSchema } from "./market";

export const AlgorithmValidationRequestSchema = z.object({
  code: z.string(),
});

export type AlgorithmValidationRequest = z.infer<
  typeof AlgorithmValidationRequestSchema
>;

export const AlgorithmValidationResultSchema = z
  .object({
    valid: z.boolean().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export type AlgorithmValidationResult = z.infer<
  typeof AlgorithmValidationResultSchema
>;

export const AlgorithmValidationResponseSchema = z.union([
  AlgorithmValidationResultSchema,
  ApiSuccessSchema(AlgorithmValidationResultSchema),
]);

export const EngineTradeSchema = z.object({
  side: z.string().optional(),
  entry_price: z.number().optional(),
  exit_price: z.number().nullable().optional(),
  quantity: z.number().optional(),
  pnl: z.number().optional(),
  net_pnl: z.number().optional(),
  pnl_percent: z.number().optional(),
  opened_at: z.union([z.number(), z.string()]).nullable().optional(),
  closed_at: z.union([z.number(), z.string()]).nullable().optional(),
  forced_close: z.boolean().optional(),
});

export type EngineTrade = z.infer<typeof EngineTradeSchema>;

export const BacktestEngineRequestSchema = z.object({
  run_id: z.string().uuid(),
  code: z.string(),
  exchange: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  initial_balance: z.number().positive(),
  start_date: z.string(),
  end_date: z.string(),
  fee_rate: z.number().optional(),
  api_key: z.string().optional(),
  api_secret: z.string().optional(),
  testnet: z.boolean().optional(),
});

export type BacktestEngineRequest = z.infer<typeof BacktestEngineRequestSchema>;

export const BacktestEngineResultSchema = z
  .object({
    total_return_percent: z.number().optional(),
    total_return_usdt: z.number().optional(),
    max_drawdown_percent: z.number().optional(),
    win_rate_percent: z.number().optional(),
    profit_factor: z.number().optional(),
    total_trades: z.number().optional(),
    analysis: BacktestAnalysisSchema.nullable().optional(),
    trades: z.array(EngineTradeSchema).optional(),
    equity_curve: z.array(EquityPointSchema).optional(),
    candles: z.array(CandleSchema).optional(),
    candles_count: z.number().optional(),
    candles_start_ts: z.number().nullable().optional(),
    candles_end_ts: z.number().nullable().optional(),
    open_positions_at_end: z.number().optional(),
    had_forced_close: z.boolean().optional(),
  })
  .passthrough();

export type BacktestEngineResult = z.infer<typeof BacktestEngineResultSchema>;

export const BacktestEngineResponseSchema = ApiResponseSchema(
  BacktestEngineResultSchema
);

export const BacktestProgressEngineResponseSchema = z.object({
  progress: z.number(),
});

export type BacktestProgressEngineResponse = z.infer<
  typeof BacktestProgressEngineResponseSchema
>;

export const StartPaperEngineRequestSchema = z.object({
  run_id: z.string().uuid(),
  code: z.string(),
  exchange: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  initial_balance: z.number().positive(),
  fee_rate: z.number().optional(),
  api_key: z.string().optional(),
  api_secret: z.string().optional(),
  testnet: z.boolean().optional(),
});

export type StartPaperEngineRequest = z.infer<typeof StartPaperEngineRequestSchema>;

export const PaperEngineActionResultSchema = z.object({
  message: z.string(),
  run_id: z.string().uuid(),
});

export type PaperEngineActionResult = z.infer<typeof PaperEngineActionResultSchema>;

export const StartPaperEngineResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    message: z.string(),
    run_id: z.string().uuid(),
  }),
  ApiSuccessSchema(PaperEngineActionResultSchema),
]);

export const StopPaperEngineResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    message: z.string(),
    run_id: z.string().uuid(),
  }),
  ApiSuccessSchema(PaperEngineActionResultSchema),
]);
