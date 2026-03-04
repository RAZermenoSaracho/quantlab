import { pool } from "../config/db";
import { emitPaperEvent } from "./websocketManager.service";
import {
  calculateTradePnl,
  calculateTradePnlPercent,
  normalizeTradeSide,
} from "../utils/tradeUtils";
import { toDateFromEngineTs, toIsoOrNull } from "../utils/dateUtils";

import {
  PaperEngineEvent,
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

/* =====================================================
   Main Entry Point
===================================================== */

export async function handlePaperEvent(
  event: PaperEngineEvent
) {
  switch (event.event_type) {
    case "trade":
      return handleTradeEvent(event.run_id, event.payload);

    case "balance":
      return handleBalanceEvent(event.run_id, event.payload);

    case "position":
      return handlePositionEvent(event.run_id, event.payload);

    case "status":
      return handleStatusEvent(event.run_id, event.payload);

    case "error":
      return handleErrorEvent(event.run_id, event.payload);

    case "candle":
      return emitPaperEvent(
        event.run_id,
        "paper_tick",
        PaperTickSchema.parse({
          run_id: event.run_id,
          ...event.payload,
        })
      );
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
    const pnl =
      trade.pnl ??
      (exitPrice != null
        ? calculateTradePnl(dbSide, entryPrice, exitPrice, quantity)
        : 0);

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
            pnl = $5,
            pnl_percent = $6,
            closed_at = $7,
            forced_close = $8
        WHERE id = $9
        `,
        [
          dbSide,
          entryPrice,
          exitPrice,
          quantity,
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
          quantity, pnl, pnl_percent, opened_at, closed_at, forced_close)
         VALUES ($1,'PAPER',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          runId,
          dbSide,
          entryPrice,
          exitPrice,
          quantity,
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
