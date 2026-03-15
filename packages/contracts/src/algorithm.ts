import { z } from "zod";
import { BacktestRunSchema } from "./backtest";
import { PaperRunSchema } from "./paper";

/* =========================
   Algorithm Entity
========================= */

export const AlgorithmSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  username: z.string().nullable().optional(),
  name: z.string(),
  notes_html: z.string().nullable().optional(),
  code: z.string(),
  github_url: z.string().nullable().optional(),
  is_public: z.boolean().optional(),
  performance_score: z.number().optional(),
  avg_return_percent: z.number().optional(),
  avg_sharpe: z.number().optional(),
  avg_pnl: z.number().optional(),
  win_rate: z.number().optional(),
  max_drawdown: z.number().optional(),
  runs_count: z.number().optional(),
  calmar_ratio: z.number().optional(),
  sortino_ratio: z.number().optional(),
  return_stability: z.number().optional(),
  confidence_score: z.number().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Algorithm = z.infer<typeof AlgorithmSchema>;

/* =========================
   DTOs
========================= */

export const CreateAlgorithmSchema = z.object({
  name: z.string().min(1),
  notes_html: z.string().optional(),
  code: z.string().optional(),
  githubUrl: z.string().optional(),
  is_public: z.boolean().optional(),
});

export type CreateAlgorithmDto = z.infer<typeof CreateAlgorithmSchema>;

export const UpdateAlgorithmSchema = z.object({
  name: z.string().optional(),
  notes_html: z.string().optional(),
  code: z.string().optional(),
  is_public: z.boolean().optional(),
});

export type UpdateAlgorithmDto = z.infer<typeof UpdateAlgorithmSchema>;

/* =========================
   Responses
========================= */

export const AlgorithmsListResponseSchema = z.object({
  algorithms: z.array(AlgorithmSchema),
});

export type AlgorithmsListResponse = z.infer<
  typeof AlgorithmsListResponseSchema
>;

export const AlgorithmSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  performance_score: z.number(),
  avg_return_percent: z.number(),
  avg_sharpe: z.number(),
  max_drawdown: z.number(),
  runs_count: z.number(),
  user_id: z.string().uuid(),
  username: z.string().nullable(),
  is_public: z.boolean(),
});

export type AlgorithmSummary = z.infer<typeof AlgorithmSummarySchema>;

export const AlgorithmRankingResponseSchema = z.object({
  algorithms: z.array(AlgorithmSummarySchema),
});

export type AlgorithmRankingResponse = z.infer<
  typeof AlgorithmRankingResponseSchema
>;

export const PublicProfileResponseSchema = z.object({
  username: z.string(),
  algorithms: z.array(AlgorithmSummarySchema),
});

export type PublicProfileResponse = z.infer<typeof PublicProfileResponseSchema>;

export const AlgorithmBacktestRunSchema = BacktestRunSchema.pick({
  id: true,
  symbol: true,
  exchange: true,
  timeframe: true,
  status: true,
  created_at: true,
  start_date: true,
  end_date: true,
  initial_balance: true,
  fee_rate: true,
  total_return_percent: true,
  total_return_usdt: true,
  sharpe_ratio: true,
}).extend({
  exchange: z.string().optional(),
  sharpe_ratio: z.number().nullable().optional(),
});

export type AlgorithmBacktestRun = z.infer<typeof AlgorithmBacktestRunSchema>;

export const AlgorithmPaperRunSchema = PaperRunSchema.pick({
  id: true,
  exchange: true,
  symbol: true,
  timeframe: true,
  status: true,
  initial_balance: true,
  current_balance: true,
  quote_balance: true,
  base_balance: true,
  equity: true,
  last_price: true,
  started_at: true,
  pnl: true,
  win_rate_percent: true,
});

export type AlgorithmPaperRun = z.infer<typeof AlgorithmPaperRunSchema>;

export const AlgorithmRunsResponseSchema = z.object({
  backtests: z.array(AlgorithmBacktestRunSchema),
  paperRuns: z.array(AlgorithmPaperRunSchema),
});

export type AlgorithmRunsResponse = z.infer<typeof AlgorithmRunsResponseSchema>;
