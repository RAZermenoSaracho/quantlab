import { z } from "zod";
import { BacktestRunSchema } from "./backtest";
import { PaperRunSchema } from "./paper";

/* =========================
   Algorithm Entity
========================= */

export const AlgorithmSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  name: z.string(),
  notes_html: z.string().nullable().optional(),
  code: z.string(),
  github_url: z.string().nullable().optional(),
  performance_score: z.number().optional(),
  avg_return_percent: z.number().optional(),
  avg_sharpe: z.number().optional(),
  avg_pnl: z.number().optional(),
  win_rate: z.number().optional(),
  max_drawdown: z.number().optional(),
  runs_count: z.number().optional(),
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
});

export type CreateAlgorithmDto = z.infer<typeof CreateAlgorithmSchema>;

export const UpdateAlgorithmSchema = z.object({
  name: z.string().optional(),
  notes_html: z.string().optional(),
  code: z.string().optional(),
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

export const AlgorithmBacktestRunSchema = BacktestRunSchema.pick({
  id: true,
  symbol: true,
  exchange: true,
  timeframe: true,
  status: true,
  created_at: true,
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
