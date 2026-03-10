import { pool } from "../config/db";
import { emitPaperEvent } from "./websocketManager.service";
import {
  calculateTradeFees,
  calculateTradeGrossPnl,
  calculateTradeNotional,
  calculateTradeNetPnl,
  calculateTradePnlPercent,
  normalizeTradeSide,
} from "../utils/tradeUtils";
import { toDateFromEngineTs, toIsoOrNull } from "../utils/dateUtils";

import {
  PaperEngineEvent,
  PortfolioStateSchema,
  type PortfolioState,
  PaperRunErrorEventSchema,
  PaperRunStatusEventSchema,
  PaperRunUpdateEventSchema,
  PaperTickSchema,
  PaperTradeEventSchema,
  PaperBalanceEventSchema,
  PaperStatusEventSchema,
  PaperPositionEventSchema,
  TradeExecutionSchema,
} from "@quantlab/contracts";

import type { z } from "zod";

/* =====================================================
   Payload Types (derived from schemas)
===================================================== */

type PaperTradePayload = z.infer<
  typeof PaperTradeEventSchema
>["payload"];

type PaperBalancePayload = z.infer<
  typeof PaperBalanceEventSchema
>["payload"];

type PaperStatusPayload = z.infer<
  typeof PaperStatusEventSchema
>["payload"];

type PaperPositionPayload = z.infer<
  typeof PaperPositionEventSchema
>["payload"];

const latestPortfolioStates = new Map<string, PortfolioState>();

export function getLatestPortfolioState(
  runId: string
): PortfolioState | null {
  return latestPortfolioStates.get(runId) ?? null;
}

/* =====================================================
   Main Entry Point
===================================================== */

export async function handlePaperEvent(
  event: PaperEngineEvent
) {
  const eventType = String((event as { event_type: string }).event_type);
  const runId = String((event as { run_id: string }).run_id);
  const payload = (event as { payload: unknown }).payload;

  switch (eventType) {
    case "trade":
      return handleTradeEvent(runId, payload as PaperTradePayload);

    case "balance":
      return handleBalanceEvent(runId, payload as PaperBalancePayload);

    case "position":
      return handlePositionEvent(runId, payload as PaperPositionPayload);

    case "position_update":
      if (payload) {
        return handlePositionEvent(runId, payload as PaperPositionPayload);
      }
      return handlePositionClearEvent(runId);

    case "status":
      return handleStatusEvent(runId, payload as PaperStatusPayload);

    case "error":
      return handleErrorEvent(runId, payload as { message: string });

    case "candle":
      return emitPaperEvent(
        runId,
        "paper_tick",
        PaperTickSchema.parse({
          run_id: runId,
          ...(payload as Record<string, unknown>),
        })
      );

    case "portfolio_update":
      return handlePortfolioUpdateEvent(runId, payload as PortfolioState);

    case "trade_fill":
      return handleTradeEvent(runId, payload as PaperTradePayload);

    case "order_created":
    case "order_filled":
    case "order_cancelled":
      return handleOrderEvent(runId, eventType, payload);
  }
}

/* =====================================================
   TRADE
===================================================== */

async function handleTradeEvent(
  runId: string,
  trade: PaperTradePayload
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const dbSide = normalizeTradeSide(trade);

    const entryPrice = trade.entry_price;
    const exitPrice = trade.exit_price ?? null;
    const quantity = trade.quantity;
    const feeRateUsed = trade.fee_rate_used ?? 0.001;
    const entryNotional =
      trade.entry_notional ??
      calculateTradeNotional(entryPrice, quantity);
    const exitNotional =
      exitPrice != null
        ? (trade.exit_notional ?? calculateTradeNotional(exitPrice, quantity))
        : null;
    const entryFee =
      trade.entry_fee ??
      calculateTradeFees(entryNotional, feeRateUsed);
    const exitFee =
      exitNotional != null
        ? (trade.exit_fee ?? calculateTradeFees(exitNotional, feeRateUsed))
        : null;
    const totalFee =
      trade.total_fee ?? (entryFee + (exitFee ?? 0));
    const grossPnl =
      trade.gross_pnl ??
      (exitPrice != null
        ? calculateTradeGrossPnl(dbSide, entryPrice, exitPrice, quantity)
        : 0);
    const netPnl =
      trade.net_pnl ??
      trade.pnl ??
      calculateTradeNetPnl(grossPnl, totalFee);
    const pnl = netPnl;

    const computedPnlPercent =
      trade.pnl_percent ??
      calculateTradePnlPercent(pnl, entryPrice, quantity);

    const openedAt = trade.opened_at
      ? toDateFromEngineTs(trade.opened_at)
      : new Date();

    const closedAt = trade.closed_at
      ? toDateFromEngineTs(trade.closed_at)
      : null;

    const forcedClose = trade.forced_close === true;
    const existingTradeResult = await client.query<{ id: string }>(
      `
      SELECT id
      FROM trades
      WHERE run_id = $1
        AND run_type = 'PAPER'
        AND opened_at = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [runId, openedAt]
    );

    const existingTrade = existingTradeResult.rows[0];

    if (existingTrade) {
      await client.query(
        `
        UPDATE trades
        SET side = $1,
            entry_price = $2,
            exit_price = $3,
            quantity = $4,
            entry_notional = $5,
            exit_notional = $6,
            entry_fee = $7,
            exit_fee = $8,
            total_fee = $9,
            gross_pnl = $10,
            net_pnl = $11,
            fee_rate_used = $12,
            pnl = $13,
            pnl_percent = $14,
            closed_at = $15,
            forced_close = $16
        WHERE id = $17
        `,
        [
          dbSide,
          entryPrice,
          exitPrice,
          quantity,
          entryNotional,
          exitNotional,
          entryFee,
          exitFee,
          totalFee,
          grossPnl,
          netPnl,
          feeRateUsed,
          pnl,
          computedPnlPercent,
          closedAt,
          forcedClose,
          existingTrade.id,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO trades
         (run_id, run_type, side, entry_price, exit_price,
          quantity, entry_notional, exit_notional, entry_fee, exit_fee, total_fee,
          gross_pnl, net_pnl, fee_rate_used, pnl, pnl_percent, opened_at, closed_at, forced_close)
         VALUES ($1,'PAPER',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          runId,
          dbSide,
          entryPrice,
          exitPrice,
          quantity,
          entryNotional,
          exitNotional,
          entryFee,
          exitFee,
          totalFee,
          grossPnl,
          netPnl,
          feeRateUsed,
          pnl,
          computedPnlPercent,
          openedAt,
          closedAt,
          forcedClose,
        ]
      );
    }

    await client.query("COMMIT");

    await emitPaperEvent(
      runId,
      "trade_execution",
      TradeExecutionSchema.parse({
        run_id: runId,
        side: dbSide,
        entry_price: entryPrice,
        exit_price: exitPrice,
        quantity,
        entry_notional: entryNotional,
        exit_notional: exitNotional,
        entry_fee: entryFee,
        exit_fee: exitFee,
        total_fee: totalFee,
        gross_pnl: grossPnl,
        net_pnl: netPnl,
        fee_rate_used: feeRateUsed,
        pnl,
        pnl_percent: computedPnlPercent,
        opened_at: toIsoOrNull(openedAt),
        closed_at: toIsoOrNull(closedAt),
        forced_close: forcedClose,
      })
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* =====================================================
   BALANCE
===================================================== */

async function handleBalanceEvent(
  runId: string,
  payload: PaperBalancePayload
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const quoteBalance = payload.quote_balance;
    const baseBalance = payload.base_balance;
    const equity = payload.equity;
    const lastPrice = payload.last_price ?? null;

    const positionJson =
      payload.position != null
        ? JSON.stringify(payload.position)
        : null;

    await client.query(
      `UPDATE paper_runs
       SET current_balance = $1,
           quote_balance = $2,
           base_balance = $3,
           equity = $4,
           last_price = $5,
           position = $6,
           updated_at = NOW()
       WHERE id = $7`,
      [
        equity,
        quoteBalance,
        baseBalance,
        equity,
        lastPrice,
        positionJson,
        runId,
      ]
    );

    await client.query("COMMIT");

    await emitPaperEvent(
      runId,
      "paper_run_update",
      PaperRunUpdateEventSchema.parse({
        run_id: runId,
        quote_balance: quoteBalance,
        base_balance: baseBalance,
        equity,
        last_price: lastPrice,
        position:
          payload.position != null
            ? {
                ...payload.position,
                opened_at: toIsoOrNull(
                  payload.position.opened_at != null
                    ? toDateFromEngineTs(payload.position.opened_at)
                    : undefined
                ),
              }
            : null,
      })
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* =====================================================
   POSITION
===================================================== */

async function handlePositionEvent(
  runId: string,
  payload: PaperPositionPayload
) {
  await emitPaperEvent(
    runId,
    "paper_run_update",
    PaperRunUpdateEventSchema.parse({
      run_id: runId,
      position: {
        ...payload,
        opened_at: toIsoOrNull(
          payload.opened_at != null
            ? toDateFromEngineTs(payload.opened_at)
            : undefined
        ),
      },
    })
  );
}

async function handlePositionClearEvent(runId: string) {
  await emitPaperEvent(
    runId,
    "paper_run_update",
    PaperRunUpdateEventSchema.parse({
      run_id: runId,
      position: null,
    })
  );
}

/* =====================================================
   STATUS
===================================================== */

async function handleStatusEvent(
  runId: string,
  payload: PaperStatusPayload
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE paper_runs
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [payload.status, runId]
    );

    await client.query("COMMIT");

    await emitPaperEvent(
      runId,
      "paper_run_status",
      PaperRunStatusEventSchema.parse({
        run_id: runId,
        status: payload.status,
      })
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* =====================================================
   ERROR
===================================================== */

async function handleErrorEvent(
  runId: string,
  payload: { message: string }
) {
  await emitPaperEvent(
    runId,
    "paper_run_error",
    PaperRunErrorEventSchema.parse({
      run_id: runId,
      message: payload.message,
    })
  );
}

/* =====================================================
   PORTFOLIO UPDATE
===================================================== */

async function handlePortfolioUpdateEvent(
  runId: string,
  payload: PortfolioState
) {
  const state = PortfolioStateSchema.parse({
    ...payload,
    run_id: runId,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE paper_runs
       SET current_balance = $1,
           quote_balance = $2,
           base_balance = $3,
           equity = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [state.usdt_balance, state.usdt_balance, state.btc_balance, state.equity, runId]
    );

    const metricsUpdate = await client.query(
      `
      UPDATE metrics
      SET total_return_usdt = $1,
          total_trades = $2,
          equity_curve = $3::jsonb
      WHERE run_id = $4
        AND run_type = 'PAPER'
      `,
      [
        state.realized_pnl,
        state.trades_count,
        JSON.stringify(state.equity_curve),
        runId,
      ]
    );

    if (!metricsUpdate.rowCount) {
      await client.query(
        `
        INSERT INTO metrics
          (run_id, run_type, total_return_usdt, total_trades, equity_curve)
        VALUES
          ($1, 'PAPER', $2, $3, $4::jsonb)
        `,
        [
          runId,
          state.realized_pnl,
          state.trades_count,
          JSON.stringify(state.equity_curve),
        ]
      );
    }

    await client.query("COMMIT");

    latestPortfolioStates.set(runId, state);

    await emitPaperEvent(runId, "portfolio_update", state);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function handleOrderEvent(
  runId: string,
  eventType: string,
  payload: unknown
) {
  const parsedPayload = payload as {
    id: string;
    symbol: string;
    side: "BUY" | "SELL";
    order_type: "market" | "limit" | "stop" | "stop_limit";
    price?: number | null;
    stop_price?: number | null;
    quantity?: number | null;
    status: "pending" | "filled" | "cancelled";
    created_at: number;
    filled_at?: number | null;
    reason?: string;
  };

  await emitPaperEvent(runId, "order_update", {
    run_id: runId,
    event_type: eventType,
    order: {
      id: parsedPayload.id,
      symbol: parsedPayload.symbol,
      side: parsedPayload.side,
      order_type: parsedPayload.order_type,
      price: parsedPayload.price ?? null,
      stop_price: parsedPayload.stop_price ?? null,
      quantity: parsedPayload.quantity ?? null,
      status: parsedPayload.status,
      created_at: parsedPayload.created_at,
      filled_at: parsedPayload.filled_at ?? null,
    },
    reason: parsedPayload.reason,
  });
}
