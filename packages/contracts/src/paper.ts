import { z } from "zod";

/* =========================
   Enums
========================= */

export const PaperRunStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "STOPPED",
]);

export type PaperRunStatus = z.infer<typeof PaperRunStatusSchema>;

export const PaperTradeSideSchema = z.enum(["BUY", "SELL"]);
export type PaperTradeSide = z.infer<typeof PaperTradeSideSchema>;

export const PaperPositionSideSchema = z.enum(["LONG", "SHORT"]);
export type PaperPositionSide = z.infer<typeof PaperPositionSideSchema>;

/* =========================
   Position
========================= */

export const PaperPositionSchema = z.object({
  side: PaperPositionSideSchema,
  quantity: z.number(),
  entry_price: z.number(),
  opened_at: z.union([z.string(), z.number()]).nullable().optional(),
});

export type PaperPosition = z.infer<typeof PaperPositionSchema>;

/* =========================
   Trade
========================= */

export const PaperTradeSchema = z.object({
  id: z.string().uuid().optional(),
  run_id: z.string().uuid(),
  side: PaperTradeSideSchema,
  entry_price: z.number(),
  exit_price: z.number().nullable().optional(),
  quantity: z.number(),
  pnl: z.number().nullable().optional(),
  pnl_percent: z.number().nullable().optional(),
  opened_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
});

export type PaperTrade = z.infer<typeof PaperTradeSchema>;

/* =========================
   Paper Run
========================= */

export const PaperRunSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  algorithm_id: z.string().uuid(),

  algorithm_name: z.string().nullable().optional(),
  algorithm_description: z.string().nullable().optional(),

  exchange: z.string(),
  symbol: z.string(),
  timeframe: z.string(),

  status: PaperRunStatusSchema,

  initial_balance: z.string(),
  current_balance: z.string(),

  quote_balance: z.string().nullable().optional(),
  base_balance: z.string().nullable().optional(),
  equity: z.string().nullable().optional(),
  last_price: z.string().nullable().optional(),
  fee_rate: z.string().nullable().optional(),

  position: PaperPositionSchema.nullable().optional(),

  engine_session_id: z.string().nullable().optional(),

  started_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export type PaperRun = z.infer<typeof PaperRunSchema>;

/* =========================
   Responses
========================= */

export const PaperRunDetailResponseSchema = z.object({
  run: PaperRunSchema,
  trades: z.array(PaperTradeSchema),
});

export type PaperRunDetailResponse = z.infer<
  typeof PaperRunDetailResponseSchema
>;