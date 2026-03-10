import { z } from "zod";

export const EquityPointSchema = z.object({
  timestamp: z.number(),
  equity: z.number(),
});

export type EquityPoint = z.infer<typeof EquityPointSchema>;

export const PortfolioStateSchema = z.object({
  run_id: z.string().uuid(),
  symbols: z.array(z.string()).optional(),
  positions: z.record(z.string(), z.unknown()).optional(),
  last_prices: z.record(z.string(), z.number()).optional(),
  balance: z.number(),
  usdt_balance: z.number(),
  btc_balance: z.number().nonnegative(),
  equity: z.number(),
  realized_pnl: z.number(),
  unrealized_pnl: z.number(),
  open_positions: z.number().int().nonnegative(),
  pending_orders: z.number().int().nonnegative().optional(),
  trades_count: z.number().int().nonnegative(),
  equity_curve: z.array(EquityPointSchema),
});

export type PortfolioState = z.infer<typeof PortfolioStateSchema>;
