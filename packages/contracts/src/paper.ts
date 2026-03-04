import { z } from "zod";

/* ======================================================
   ENUMS
====================================================== */

export const PaperRunStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "STOPPED",
]);

export type PaperRunStatus = z.infer<typeof PaperRunStatusSchema>;

export const PaperTradeSideSchema = z.enum(["LONG", "SHORT"]);
export type PaperTradeSide = z.infer<typeof PaperTradeSideSchema>;

export const PaperPositionSideSchema = PaperTradeSideSchema;
export type PaperPositionSide = z.infer<typeof PaperPositionSideSchema>;

/* ======================================================
   DOMAIN MODELS
====================================================== */

export const PaperPositionSchema = z.object({
  side: PaperPositionSideSchema,
  quantity: z.number(),
  entry_price: z.number(),
  opened_at: z.string().nullable().optional(),
});

export type PaperPosition = z.infer<typeof PaperPositionSchema>;

export const PaperTradeSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid(),

  run_type: z.literal("PAPER").optional(),

  side: PaperTradeSideSchema,

  entry_price: z.number(),
  exit_price: z.number().nullable().optional(),

  quantity: z.number(),

  pnl: z.number().nullable().optional(),
  pnl_percent: z.number().nullable().optional(),

  opened_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),

  created_at: z.string().nullable().optional(),

  forced_close: z.boolean().optional(),
});

export type PaperTrade = z.infer<typeof PaperTradeSchema>;

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

  initial_balance: z.number(),
  current_balance: z.number(),

  quote_balance: z.number().nullable().optional(),
  base_balance: z.number().nullable().optional(),
  equity: z.number().nullable().optional(),
  last_price: z.number().nullable().optional(),
  fee_rate: z.number().nullable().optional(),

  position: PaperPositionSchema.nullable().optional(),

  engine_session_id: z.string().nullable().optional(),

  started_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export type PaperRun = z.infer<typeof PaperRunSchema>;

/* ======================================================
   RESPONSES
====================================================== */

export const PaperRunDetailResponseSchema = z.object({
  run: PaperRunSchema,
  trades: z.array(PaperTradeSchema),
});

export type PaperRunDetailResponse = z.infer<
  typeof PaperRunDetailResponseSchema
>;

export const PaperRunsListResponseSchema = z.object({
  runs: z.array(PaperRunSchema),
});

export type PaperRunsListResponse = z.infer<
  typeof PaperRunsListResponseSchema
>;

/* ======================================================
   START PAPER RUN
====================================================== */

export const StartPaperRunRequestSchema = z.object({
  algorithm_id: z.string().uuid(),
  exchange: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  initial_balance: z.number(),
  fee_rate: z.number().optional(),
});

export type StartPaperRunRequest = z.infer<
  typeof StartPaperRunRequestSchema
>;

export const StartPaperRunResponseSchema = z.object({
  run_id: z.string().uuid(),
});

export type StartPaperRunResponse = z.infer<
  typeof StartPaperRunResponseSchema
>;

/* ======================================================
   GENERIC MESSAGE RESPONSE
====================================================== */

export const MessageResponseSchema = z.object({
  message: z.string(),
});

export type MessageResponse = z.infer<typeof MessageResponseSchema>;

/* ======================================================
   ENGINE → BACKEND EVENTS
====================================================== */

/* Engine position format (timestamps = numbers) */

export const PaperEnginePositionSchema = z.object({
  side: PaperPositionSideSchema,
  quantity: z.number(),
  entry_price: z.number(),
  opened_at: z.number().nullable().optional(),
});

/* ================= TRADE EVENT ================= */

export const PaperTradeEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("trade"),
  payload: z.object({
    side: PaperTradeSideSchema,
    entry_price: z.number(),
    exit_price: z.number().nullable().optional(),
    quantity: z.number(),
    pnl: z.number().optional(),
    pnl_percent: z.number().optional(),
    opened_at: z.number().nullable().optional(),
    closed_at: z.number().nullable().optional(),
    forced_close: z.boolean().optional(),
  }),
});

/* ================= BALANCE EVENT ================= */

export const PaperBalanceEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("balance"),
  payload: z.object({
    quote_balance: z.number(),
    base_balance: z.number(),
    equity: z.number(),
    last_price: z.number().nullable().optional(),
    position: PaperEnginePositionSchema.nullable().optional(),
  }),
});

/* ================= STATUS EVENT ================= */

export const PaperStatusEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("status"),
  payload: z.object({
    status: PaperRunStatusSchema,
  }),
});

/* ================= POSITION EVENT ================= */

export const PaperPositionEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("position"),
  payload: PaperEnginePositionSchema,
});

/* ================= ERROR EVENT ================= */

export const PaperErrorEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("error"),
  payload: z.object({
    message: z.string(),
  }),
});

/* ================= CANDLE EVENT ================= */

export const PaperCandleEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("candle"),
  payload: z.object({
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
    timestamp: z.number(),
  }),
});

/* ================= DISCRIMINATED UNION ================= */

export const PaperEngineEventSchema = z.discriminatedUnion(
  "event_type",
  [
    PaperTradeEventSchema,
    PaperBalanceEventSchema,
    PaperStatusEventSchema,
    PaperPositionEventSchema,
    PaperErrorEventSchema,
    PaperCandleEventSchema,
  ]
);

export type PaperEngineEvent = z.infer<typeof PaperEngineEventSchema>;