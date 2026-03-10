import { z } from "zod";

export const EquityPointSchema = z.object({
  timestamp: z.number(),
  equity: z.number(),
});

export type EquityPoint = z.infer<typeof EquityPointSchema>;

export const PortfolioStateSchema = z.object({
  run_id: z.string().uuid(),
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
