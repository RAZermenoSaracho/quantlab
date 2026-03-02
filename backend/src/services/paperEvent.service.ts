import { pool } from "../config/db";
import { emitPaperEvent } from "./websocketManager.service";
import { normalizeTradeSide } from "../utils/tradeUtils";
import { toDateFromEngineTs } from "../utils/dateUtils";

type PaperEventType =
  | "trade"
  | "balance"
  | "position"
  | "status"
  | "error"
  | "candle";

interface PaperEventPayload {
  run_id: string;
  event_type: PaperEventType;
  payload: any;
}

/**
 * Main event handler entrypoint
 */
export async function handlePaperEvent(event: PaperEventPayload) {
  const { run_id, event_type, payload } = event;

  if (!run_id || !event_type) {
    throw new Error("Invalid paper event payload");
  }

  switch (event_type) {
    case "trade":
      await handleTradeEvent(run_id, payload);
      break;

    case "balance":
      await handleBalanceEvent(run_id, payload);
      break;

    case "position":
      await handlePositionEvent(run_id, payload);
      break;

    case "status":
      await handleStatusEvent(run_id, payload);
      break;

    case "error":
      await handleErrorEvent(run_id, payload);
      break;
    
    case "candle":
      emitPaperEvent(run_id, "candle", {
        run_id,
        ...payload,
      });
      break;

    default:
      throw new Error(`Unsupported paper event type: ${event_type}`);
  }
}

async function handleTradeEvent(runId: string, trade: any) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const dbSide = normalizeTradeSide(trade);

    const entryPrice = Number(trade.entry_price ?? 0);
    const exitPrice =
      trade.exit_price == null ? null : Number(trade.exit_price);
    const quantity = Number(trade.quantity ?? 1);
    const pnl = Number(trade.pnl ?? trade.net_pnl ?? 0);

    const computedPnlPercent =
      trade.pnl_percent != null
        ? Number(trade.pnl_percent)
        : entryPrice
        ? (pnl / (entryPrice * quantity)) * 100
        : 0;

    const openedAt = trade.opened_at
      ? toDateFromEngineTs(trade.opened_at)
      : new Date();

    const closedAt = trade.closed_at
      ? toDateFromEngineTs(trade.closed_at)
      : new Date();

    const forcedClose = trade.forced_close === true;

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

    await client.query("COMMIT");

    emitPaperEvent(runId, "trade", { run_id: runId, ...trade });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function handleBalanceEvent(runId: string, payload: any) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const quoteBalance = Number(payload.quote_balance ?? 0);
    const baseBalance = Number(payload.base_balance ?? 0);
    const equity = Number(payload.equity ?? quoteBalance);
    const lastPrice =
      payload.last_price != null ? Number(payload.last_price) : null;

    const positionJson =
      payload.position && typeof payload.position === "object"
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

    emitPaperEvent(runId, "update", {
      run_id: runId,
      quote_balance: quoteBalance,
      base_balance: baseBalance,
      equity,
      last_price: lastPrice,
      position: payload.position ?? null,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function handlePositionEvent(runId: string, payload: any) {
  emitPaperEvent(runId, "position", payload);
}

async function handleStatusEvent(runId: string, payload: any) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const status = payload.status;

    await client.query(
      `UPDATE paper_runs
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [status, runId]
    );

    await client.query("COMMIT");

    emitPaperEvent(runId, "status", payload);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function handleErrorEvent(runId: string, payload: any) {
  emitPaperEvent(runId, "error", payload);
}

