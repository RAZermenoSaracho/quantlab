import { z } from "zod";
import { CandleSchema } from "./market";
import { PaperPositionSchema, PaperRunStatusSchema } from "./paper";
import { PortfolioStateSchema } from "./portfolio";

export const JoinPaperRunSchema = z.string().uuid();
export const LeavePaperRunSchema = z.string().uuid();

export const PaperTickSchema = CandleSchema.extend({
  run_id: z.string().uuid(),
});

export type PaperTick = z.infer<typeof PaperTickSchema>;

export const TradeExecutionSchema = z.object({
  run_id: z.string().uuid(),
  side: z.enum(["LONG", "SHORT"]),
  entry_price: z.number(),
  exit_price: z.number().nullable().optional(),
  quantity: z.number(),
  pnl: z.number().nullable().optional(),
  pnl_percent: z.number().nullable().optional(),
  opened_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  forced_close: z.boolean().optional(),
});

export type TradeExecution = z.infer<typeof TradeExecutionSchema>;

export const PaperRunUpdateEventSchema = z.object({
  run_id: z.string().uuid(),
  quote_balance: z.number().optional(),
  base_balance: z.number().optional(),
  equity: z.number().optional(),
  last_price: z.number().nullable().optional(),
  position: PaperPositionSchema.nullable().optional(),
});

export type PaperRunUpdateEvent = z.infer<typeof PaperRunUpdateEventSchema>;

export const PaperRunStatusEventSchema = z.object({
  run_id: z.string().uuid(),
  status: PaperRunStatusSchema,
});

export type PaperRunStatusEvent = z.infer<typeof PaperRunStatusEventSchema>;

export const PaperRunErrorEventSchema = z.object({
  run_id: z.string().uuid(),
  message: z.string(),
});

export type PaperRunErrorEvent = z.infer<typeof PaperRunErrorEventSchema>;

export const PortfolioUpdateEventSchema = PortfolioStateSchema;
export type PortfolioUpdateEvent = z.infer<typeof PortfolioUpdateEventSchema>;

export const BacktestProgressEventSchema = z.object({
  run_id: z.string().uuid(),
  status: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
  progress: z.number(),
});

export type BacktestProgressEvent = z.infer<typeof BacktestProgressEventSchema>;

export type ServerToClientEvents = {
  paper_tick: (payload: PaperTick) => void;
  trade_execution: (payload: TradeExecution) => void;
  paper_run_update: (payload: PaperRunUpdateEvent) => void;
  paper_run_status: (payload: PaperRunStatusEvent) => void;
  paper_run_error: (payload: PaperRunErrorEvent) => void;
  portfolio_update: (payload: PortfolioUpdateEvent) => void;
  backtest_progress: (payload: BacktestProgressEvent) => void;
};

export type ClientToServerEvents = {
  join_paper_run: (runId: z.infer<typeof JoinPaperRunSchema>) => void;
  leave_paper_run: (runId: z.infer<typeof LeavePaperRunSchema>) => void;
};
