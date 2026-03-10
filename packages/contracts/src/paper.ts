import { z } from "zod";
import { PortfolioStateSchema } from "./portfolio";
import { CandleSchema, MarketTimeframeSchema } from "./market";

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
  average_entry_price: z.number().optional(),
  entries_count: z.number().int().optional(),
  fees_paid: z.number().optional(),
  market_value: z.number().optional(),
  breakeven_price: z.number().optional(),
  gross_pnl: z.number().optional(),
  net_pnl: z.number().optional(),
  realized_pnl: z.number().optional(),
  unrealized_pnl: z.number().optional(),
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

  entry_notional: z.number().nullable().optional(),
  exit_notional: z.number().nullable().optional(),
  entry_fee: z.number().nullable().optional(),
  exit_fee: z.number().nullable().optional(),
  total_fee: z.number().nullable().optional(),
  gross_pnl: z.number().nullable().optional(),
  net_pnl: z.number().nullable().optional(),
  fee_rate_used: z.number().nullable().optional(),

  pnl: z.number().nullable().optional(),
  pnl_percent: z.number().nullable().optional(),

  opened_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),

  created_at: z.string().nullable().optional(),

  forced_close: z.boolean().optional(),
});

export type PaperTrade = z.infer<typeof PaperTradeSchema>;

export const PaperOrderTypeSchema = z.enum(["market", "limit", "stop", "stop_limit"]);
export type PaperOrderType = z.infer<typeof PaperOrderTypeSchema>;

export const PaperOrderSideSchema = z.enum(["BUY", "SELL"]);
export type PaperOrderSide = z.infer<typeof PaperOrderSideSchema>;

export const PaperOrderStatusSchema = z.enum(["pending", "filled", "cancelled"]);
export type PaperOrderStatus = z.infer<typeof PaperOrderStatusSchema>;

export const PaperOrderSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: PaperOrderSideSchema,
  order_type: PaperOrderTypeSchema,
  price: z.number().nullable().optional(),
  stop_price: z.number().nullable().optional(),
  quantity: z.number().nullable().optional(),
  status: PaperOrderStatusSchema,
  created_at: z.number(),
  filled_at: z.number().nullable().optional(),
});
export type PaperOrder = z.infer<typeof PaperOrderSchema>;

export const PaperRunSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  algorithm_id: z.string().uuid(),

  algorithm_name: z.string().nullable().optional(),
  algorithm_description: z.string().nullable().optional(),

  exchange: z.string(),
  symbol: z.string(),
  timeframe: MarketTimeframeSchema,

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

export const PaperRunChartResponseSchema = z.object({
  candles: z.array(CandleSchema),
  trades: z.array(PaperTradeSchema),
});

export type PaperRunChartResponse = z.infer<
  typeof PaperRunChartResponseSchema
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
  timeframe: MarketTimeframeSchema,
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
  average_entry_price: z.number().optional(),
  entries_count: z.number().int().optional(),
  fees_paid: z.number().optional(),
  market_value: z.number().optional(),
  breakeven_price: z.number().optional(),
  gross_pnl: z.number().optional(),
  net_pnl: z.number().optional(),
  realized_pnl: z.number().optional(),
  unrealized_pnl: z.number().optional(),
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
    entry_notional: z.number().optional(),
    exit_notional: z.number().nullable().optional(),
    entry_fee: z.number().optional(),
    exit_fee: z.number().nullable().optional(),
    total_fee: z.number().optional(),
    gross_pnl: z.number().optional(),
    net_pnl: z.number().optional(),
    fee_rate_used: z.number().optional(),
    entries_count_after_fill: z.number().int().optional(),
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

/* ================= POSITION UPDATE EVENT ================= */

export const PaperPositionUpdateEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("position_update"),
  payload: PaperEnginePositionSchema.nullable(),
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

/* ================= PORTFOLIO UPDATE EVENT ================= */

export const PaperPortfolioUpdateEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("portfolio_update"),
  payload: PortfolioStateSchema,
});

/* ================= ORDER EVENTS ================= */

export const PaperOrderCreatedEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("order_created"),
  payload: PaperOrderSchema.extend({
    reason: z.string().optional(),
  }),
});

export const PaperOrderFilledEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("order_filled"),
  payload: PaperOrderSchema.extend({
    reason: z.string().optional(),
  }),
});

export const PaperOrderCancelledEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("order_cancelled"),
  payload: PaperOrderSchema.extend({
    reason: z.string().optional(),
  }),
});

/* ================= TRADE FILL EVENT ================= */

export const PaperTradeFillEventSchema = z.object({
  run_id: z.string().uuid(),
  event_type: z.literal("trade_fill"),
  payload: PaperTradeEventSchema.shape.payload,
});

/* ================= DISCRIMINATED UNION ================= */

export const PaperEngineEventSchema = z.discriminatedUnion(
  "event_type",
  [
    PaperTradeEventSchema,
    PaperBalanceEventSchema,
    PaperStatusEventSchema,
    PaperPositionEventSchema,
    PaperPositionUpdateEventSchema,
    PaperErrorEventSchema,
    PaperCandleEventSchema,
    PaperPortfolioUpdateEventSchema,
    PaperOrderCreatedEventSchema,
    PaperOrderFilledEventSchema,
    PaperOrderCancelledEventSchema,
    PaperTradeFillEventSchema,
  ]
);

export type PaperEngineEvent = z.infer<typeof PaperEngineEventSchema>;
