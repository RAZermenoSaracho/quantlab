import { z } from "zod";

/* =========================
   Exchange
========================= */

export const ExchangeSchema = z.object({
  id: z.string(),
  name: z.string(),
  default_fee_rate: z.number(),
});

export type Exchange = z.infer<typeof ExchangeSchema>;

/* =========================
   Symbol
========================= */

export const SymbolSchema = z.object({
  symbol: z.string(),
});

export type Symbol = z.infer<typeof SymbolSchema>;

/* =========================
   Candle
========================= */

export const CandleSchema = z.object({
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export type Candle = z.infer<typeof CandleSchema>;

/* =========================
   Equity Point
========================= */

export const EquityPointSchema = z.object({
  timestamp: z.number(),
  equity: z.number(),
});

export type EquityPoint = z.infer<typeof EquityPointSchema>;

/* =========================
   Responses
========================= */

export const ExchangesListResponseSchema = z.object({
  exchanges: z.array(ExchangeSchema),
});

export type ExchangesListResponse = z.infer<
  typeof ExchangesListResponseSchema
>;

export const SymbolsListResponseSchema = z.object({
  symbols: z.array(SymbolSchema),
});

export type SymbolsListResponse = z.infer<
  typeof SymbolsListResponseSchema
>;

export const DefaultFeeRateResponseSchema = z.object({
  default_fee_rate: z.number(),
});

export type DefaultFeeRateResponse = z.infer<
  typeof DefaultFeeRateResponseSchema
>;