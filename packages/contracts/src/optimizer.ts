import { z } from "zod";
import { ApiResponseSchema } from "./common";
import { BacktestAnalysisSchema, BacktestMetricsSchema } from "./backtest";
import { MarketTimeframeSchema } from "./market";


const OptimizerParamValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.null(),
]);

export const OptimizerParamValuesSchema = z.array(OptimizerParamValueSchema);
export type OptimizerParamValue = z.infer<typeof OptimizerParamValueSchema>;

export const OptimizerParamSpaceSchema = z.record(
  z.string(),
  OptimizerParamValuesSchema
);
export type OptimizerParamSpace = z.infer<typeof OptimizerParamSpaceSchema>;

export const OptimizerRequestSchema = z.object({
  algorithmId: z.string().uuid(),
  exchange: z.string().min(1),
  symbol: z.string().min(1),
  paramSpace: OptimizerParamSpaceSchema,
});
export type OptimizerRequest = z.infer<typeof OptimizerRequestSchema>;

export const OptimizerEngineRequestSchema = z.object({
  code: z.string(),
  exchange: z.string(),
  symbol: z.string(),
  timeframe: MarketTimeframeSchema,
  initial_balance: z.number().positive(),
  start_date: z.string(),
  end_date: z.string(),
  param_space: OptimizerParamSpaceSchema,
  fee_rate: z.number().optional(),
  api_key: z.string().optional(),
  api_secret: z.string().optional(),
  testnet: z.boolean().optional(),
});
export type OptimizerEngineRequest = z.infer<typeof OptimizerEngineRequestSchema>;

export const OptimizerRunResultSchema = z.object({
  rank: z.number().int().positive(),
  params: z.record(z.string(), OptimizerParamValueSchema),
  metrics: BacktestMetricsSchema,
  analysis: BacktestAnalysisSchema.nullable().optional(),
});
export type OptimizerRunResult = z.infer<typeof OptimizerRunResultSchema>;

export const OptimizerBaselineSchema = z.object({
  exchange: z.string(),
  symbol: z.string(),
  timeframe: MarketTimeframeSchema,
  initial_balance: z.number(),
  start_date: z.string(),
  end_date: z.string(),
  fee_rate: z.number().nullable().optional(),
});
export type OptimizerBaseline = z.infer<typeof OptimizerBaselineSchema>;

export const OptimizerRankingSchema = z.object({
  results: z.array(OptimizerRunResultSchema),
  combinations_generated: z.number().int().nonnegative(),
  combinations_evaluated: z.number().int().nonnegative(),
  truncated: z.boolean(),
  baseline: OptimizerBaselineSchema.optional(),
});
export type OptimizerRanking = z.infer<typeof OptimizerRankingSchema>;

export const OptimizerResponseSchema = ApiResponseSchema(OptimizerRankingSchema);
