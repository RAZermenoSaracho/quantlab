import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import {
  startPaperOnEngine,
  stopPaperOnEngine,
} from "../services/pythonEngine.service";
import {
  getLatestPortfolioState,
  handlePaperEvent,
} from "../services/paperEvent.service";
import {
  type ApiResponse,
  type MessageResponse,
  type PortfolioState,
  type PaperRunDetailResponse,
  type PaperRunsListResponse,
  PaperEngineEventSchema,
  MarketTimeframeSchema,
  type StartPaperRunResponse,
} from "@quantlab/contracts";
import { sendError, sendSuccess } from "../utils/apiResponse";
import { toIsoOrNull } from "../utils/dateUtils";
import { z } from "zod";

const StartPaperRunLegacyRequestSchema = z
  .object({
    algorithm_id: z.string().uuid().optional(),
    code: z.string().min(1).optional(),
    exchange: z.string(),
    symbol: z.string(),
    timeframe: MarketTimeframeSchema,
    initial_balance: z.number(),
    fee_rate: z.number().optional(),
  })
  .refine((value) => Boolean(value.algorithm_id || value.code), {
    message: "Either algorithm_id or code is required",
  });

/* =====================================================
   START PAPER RUN
===================================================== */
export async function startPaperRun(
  req: Request,
  res: Response<ApiResponse<StartPaperRunResponse>>,
  next: NextFunction
) {
  const client = await pool.connect();

  try {
    const payload = StartPaperRunLegacyRequestSchema.parse(req.body);

    const {
      exchange,
      symbol,
      timeframe,
      initial_balance,
      fee_rate,
    } = payload;

    const parsedBalance = Number(initial_balance);
    if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) {
      return sendError(res, "Invalid initial_balance", 400);
    }

    const userId = req.user!.id;

    const algoResult = payload.algorithm_id
      ? await client.query(
          `SELECT id, code
           FROM algorithms
           WHERE id = $1 AND user_id = $2`,
          [payload.algorithm_id, userId]
        )
      : await client.query(
          `SELECT id, code
           FROM algorithms
           WHERE user_id = $1 AND code = $2
           ORDER BY updated_at DESC
           LIMIT 1`,
          [userId, payload.code]
        );

    if (!algoResult.rowCount) {
      return sendError(res, "Algorithm not found", 404);
    }

    const algorithmId: string = algoResult.rows[0].id;
    const code = algoResult.rows[0].code;

    await client.query("BEGIN");

    const runInsert = await client.query(
      `INSERT INTO paper_runs
       (user_id, algorithm_id, exchange, fee_rate,
        symbol, timeframe, initial_balance, current_balance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'ACTIVE')
       RETURNING id`,
      [
        userId,
        algorithmId,
        exchange ?? "binance",
        fee_rate ?? 0.001,
        symbol,
        timeframe,
        parsedBalance,
      ]
    );

    const runId: string = runInsert.rows[0].id;

    await client.query("COMMIT");

    sendSuccess(res, { run_id: runId }, 201);

    // Start engine asynchronously
    startPaperOnEngine({
      run_id: runId,
      code,
      exchange: exchange ?? "binance",
      symbol,
      timeframe,
      initial_balance: parsedBalance,
      fee_rate: fee_rate ?? 0.001,
    }).catch(async () => {
      await pool.query(
        `UPDATE paper_runs SET status = 'STOPPED' WHERE id = $1`,
        [runId]
      );
    });

  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

/* =====================================================
   STOP PAPER RUN
===================================================== */
export async function stopPaperRun(
  req: Request,
  res: Response<ApiResponse<MessageResponse>>,
  next: NextFunction
) {
  try {
    const rawId = req.params.id;

    if (!rawId || Array.isArray(rawId)) {
      return sendError(res, "Invalid id parameter", 400);
    }

    const runId = rawId;
    const userId = req.user!.id;

    const runResult = await pool.query(
      `SELECT id FROM paper_runs WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (!runResult.rowCount) {
      return sendError(res, "Paper run not found", 404);
    }

    await stopPaperOnEngine(runId);

    await pool.query(
      `UPDATE paper_runs
       SET status = 'STOPPED',
           updated_at = NOW()
       WHERE id = $1`,
      [runId]
    );

    return sendSuccess(res, { message: "Paper run stopped" });

  } catch (err) {
    next(err);
  }
}

/* =====================================================
   INTERNAL ENGINE EVENT RECEIVER
===================================================== */
export async function receivePaperEvent(
  req: Request,
  res: Response<ApiResponse<Record<string, never>>>,
  next: NextFunction
) {
  try {
    const event = PaperEngineEventSchema.parse(req.body);

    await handlePaperEvent(event);

    return sendSuccess(res, {});
  } catch (err) {
    next(err);
  }
}

/* =====================================================
   GET ONE PAPER RUN
===================================================== */
/* =====================================================
   GET ONE PAPER RUN (STRICT + NORMALIZED)
===================================================== */
export async function getPaperRunById(
  req: Request,
  res: Response<ApiResponse<PaperRunDetailResponse>>,
  next: NextFunction
) {
  try {
    const rawId = req.params.id;
    if (!rawId || Array.isArray(rawId)) {
      return sendError(res, "Invalid id parameter", 400);
    }
    const runId = rawId;
    const userId = req.user!.id;

    /* =========================
       FETCH RUN
    ========================= */

    const runResult = await pool.query(
      `
      SELECT 
        r.*,
        a.name AS algorithm_name,
        a.notes_html AS algorithm_description
      FROM paper_runs r
      JOIN algorithms a ON a.id = r.algorithm_id
      WHERE r.id = $1 AND r.user_id = $2
      `,
      [runId, userId]
    );

    if (!runResult.rowCount) {
      return sendError(res, "Paper run not found", 404);
    }

    const rawRun = runResult.rows[0];

    /* =========================
       NORMALIZE POSITION JSON
    ========================= */

    let normalizedPosition = null;

    if (rawRun.position) {
      const pos = rawRun.position;

      normalizedPosition = {
        side: pos.side,
        quantity: Number(pos.quantity),
        entry_price: Number(pos.entry_price),
        opened_at:
          pos.opened_at != null
            ? new Date(pos.opened_at).toISOString()
            : null,
      };
    }

    /* =========================
       NORMALIZE RUN
    ========================= */

    const normalizedRun = {
      id: rawRun.id,
      user_id: rawRun.user_id,
      algorithm_id: rawRun.algorithm_id,

      algorithm_name: rawRun.algorithm_name ?? null,
      algorithm_description: rawRun.algorithm_description ?? null,

      exchange: rawRun.exchange,
      symbol: rawRun.symbol,
      timeframe: rawRun.timeframe,

      status: rawRun.status,

      initial_balance: Number(rawRun.initial_balance),
      current_balance: Number(rawRun.current_balance),

      quote_balance:
        rawRun.quote_balance != null
          ? Number(rawRun.quote_balance)
          : null,

      base_balance:
        rawRun.base_balance != null
          ? Number(rawRun.base_balance)
          : null,

      equity:
        rawRun.equity != null
          ? Number(rawRun.equity)
          : null,

      last_price:
        rawRun.last_price != null
          ? Number(rawRun.last_price)
          : null,

      fee_rate:
        rawRun.fee_rate != null
          ? Number(rawRun.fee_rate)
          : null,

      position: normalizedPosition,

      engine_session_id: rawRun.engine_session_id ?? null,

      started_at: toIsoOrNull(rawRun.started_at),
      updated_at: toIsoOrNull(rawRun.updated_at),
    };

    /* =========================
       FETCH TRADES
    ========================= */

    const tradesResult = await pool.query(
      `
      SELECT
        id,
        run_id,
        side,
        entry_price,
        exit_price,
        quantity,
        entry_notional,
        exit_notional,
        entry_fee,
        exit_fee,
        total_fee,
        gross_pnl,
        net_pnl,
        fee_rate_used,
        pnl,
        pnl_percent,
        opened_at,
        closed_at,
        created_at,
        forced_close
      FROM trades
      WHERE run_id = $1 AND run_type = 'PAPER'
      ORDER BY created_at ASC
      `,
      [runId]
    );

    /* =========================
       NORMALIZE TRADES
    ========================= */

    const normalizedTrades = tradesResult.rows.map((t) => ({
      id: t.id,
      run_id: t.run_id,
      run_type: "PAPER" as const,

      side: t.side,

      entry_price: Number(t.entry_price),
      exit_price: t.exit_price != null ? Number(t.exit_price) : null,

      quantity: Number(t.quantity),

      entry_notional:
        t.entry_notional != null ? Number(t.entry_notional) : null,
      exit_notional:
        t.exit_notional != null ? Number(t.exit_notional) : null,
      entry_fee: t.entry_fee != null ? Number(t.entry_fee) : null,
      exit_fee: t.exit_fee != null ? Number(t.exit_fee) : null,
      total_fee: t.total_fee != null ? Number(t.total_fee) : null,
      gross_pnl: t.gross_pnl != null ? Number(t.gross_pnl) : null,
      net_pnl: t.net_pnl != null ? Number(t.net_pnl) : null,
      fee_rate_used:
        t.fee_rate_used != null ? Number(t.fee_rate_used) : null,

      pnl:
        t.pnl != null
          ? Number(t.pnl)
          : t.net_pnl != null
            ? Number(t.net_pnl)
            : null,
      pnl_percent: t.pnl_percent != null ? Number(t.pnl_percent) : null,

      opened_at: toIsoOrNull(t.opened_at),
      closed_at: toIsoOrNull(t.closed_at),

      created_at: toIsoOrNull(t.created_at),

      forced_close: Boolean(t.forced_close),
    }));

    /* =========================
       STRICT CONTRACT VALIDATION
    ========================= */

    const response: PaperRunDetailResponse = {
      run: normalizedRun,
      trades: normalizedTrades,
    };

    return sendSuccess(res, response);
  } catch (err) {
    next(err);
  }
}

/* =====================================================
   GET PAPER PORTFOLIO STATE
===================================================== */
export async function getPaperRunState(
  req: Request,
  res: Response<ApiResponse<PortfolioState>>,
  next: NextFunction
) {
  try {
    const rawId = req.params.id;
    if (!rawId || Array.isArray(rawId)) {
      return sendError(res, "Invalid id parameter", 400);
    }
    const runId = rawId;
    const userId = req.user!.id;

    const runResult = await pool.query(
      `
      SELECT
        id,
        initial_balance,
        current_balance,
        equity,
        last_price,
        position,
        started_at
      FROM paper_runs
      WHERE id = $1 AND user_id = $2
      `,
      [runId, userId]
    );

    if (!runResult.rowCount) {
      return sendError(res, "Paper run not found", 404);
    }

    const latest = getLatestPortfolioState(runId);
    if (latest) {
      return sendSuccess(res, latest);
    }

    const rawRun = runResult.rows[0];

    const metricsResult = await pool.query(
      `
      SELECT
        total_return_usdt,
        equity_curve
      FROM metrics
      WHERE run_id = $1 AND run_type = 'PAPER'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [runId]
    );

    const tradesResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE exit_price IS NOT NULL)::int AS closed_trades,
        COALESCE(SUM(CASE WHEN exit_price IS NOT NULL THEN pnl ELSE 0 END), 0) AS realized_pnl
      FROM trades
      WHERE run_id = $1 AND run_type = 'PAPER'
      `,
      [runId]
    );

    const usdtBalance = Number(
      rawRun.quote_balance ?? rawRun.current_balance ?? rawRun.initial_balance ?? 0
    );
    const btcBalance = Math.max(0, Number(rawRun.base_balance ?? 0));
    const initialBalance = Number(rawRun.initial_balance ?? 0);
    const lastPrice =
      rawRun.last_price != null ? Number(rawRun.last_price) : null;
    const position = rawRun.position as
      | {
          side?: string;
          quantity?: number;
          entry_price?: number;
        }
      | null;

    let unrealizedPnl = 0;
    if (position && lastPrice != null) {
      const qty = Number(position.quantity ?? 0);
      const entryPrice = Number(position.entry_price ?? 0);
      const side = String(position.side ?? "").toUpperCase();

      if (qty > 0 && entryPrice > 0) {
        unrealizedPnl =
          side === "SHORT"
            ? (entryPrice - lastPrice) * qty
            : (lastPrice - entryPrice) * qty;
      }
    }

    const realizedFromMetrics =
      metricsResult.rowCount && metricsResult.rows[0].total_return_usdt != null
        ? Number(metricsResult.rows[0].total_return_usdt)
        : null;

    const tradesRow = tradesResult.rows[0];
    const realizedFromTrades = Number(tradesRow.realized_pnl ?? 0);
    const realizedPnl = realizedFromMetrics ?? realizedFromTrades;
    const closedTrades = Number(tradesRow.closed_trades ?? 0);

    const rawCurve =
      metricsResult.rowCount && Array.isArray(metricsResult.rows[0].equity_curve)
        ? (metricsResult.rows[0].equity_curve as Array<{
            timestamp?: number;
            equity?: number;
          }>)
        : [];

    const equityCurve = rawCurve
      .map((point) => ({
        timestamp: Number(point.timestamp ?? 0),
        equity: Number(point.equity ?? 0),
      }))
      .filter(
        (point) =>
          Number.isFinite(point.timestamp) && Number.isFinite(point.equity)
      );

    if (equityCurve.length === 0) {
      equityCurve.push({
        timestamp:
          rawRun.started_at != null
            ? new Date(rawRun.started_at).getTime()
            : Date.now(),
        equity: initialBalance,
      });
    } else {
      const hasInitialPoint = Math.abs(equityCurve[0].equity - initialBalance) < 1e-9;
      if (!hasInitialPoint) {
        equityCurve.unshift({
          timestamp:
            rawRun.started_at != null
              ? new Date(rawRun.started_at).getTime()
              : equityCurve[0].timestamp,
          equity: initialBalance,
        });
      }
    }

    const response: PortfolioState = {
      run_id: runId,
      balance: usdtBalance,
      usdt_balance: usdtBalance,
      btc_balance: btcBalance,
      equity:
        rawRun.equity != null
          ? Number(rawRun.equity)
          : usdtBalance + (btcBalance * Number(rawRun.last_price ?? 0)),
      realized_pnl: realizedPnl,
      unrealized_pnl: unrealizedPnl,
      open_positions: position ? 1 : 0,
      trades_count: closedTrades,
      equity_curve: equityCurve,
    };

    return sendSuccess(res, response);
  } catch (err) {
    next(err);
  }
}

/* =====================================================
   GET ALL PAPER RUNS
===================================================== */
export async function getAllPaperRuns(
  req: Request,
  res: Response<ApiResponse<PaperRunsListResponse>>,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.user_id,
        p.algorithm_id,
        p.symbol,
        p.timeframe,
        p.status,
        p.started_at,
        p.exchange,
        a.name AS algorithm_name,
        p.current_balance,
        p.initial_balance
      FROM paper_runs p
      LEFT JOIN algorithms a
        ON a.id = p.algorithm_id
      WHERE p.user_id = $1
      ORDER BY p.started_at DESC
      `,
      [userId]
    );

    const normalizedRuns = result.rows.map((r) => ({
      ...r,
      initial_balance: Number(r.initial_balance),
      current_balance: Number(r.current_balance),
      started_at: toIsoOrNull(r.started_at),
    }));

    return sendSuccess(res, { runs: normalizedRuns });
  } catch (err) {
    next(err);
  }
}

/* =====================================================
   DELETE PAPER RUN
===================================================== */
export async function deletePaperRun(
  req: Request,
  res: Response<ApiResponse<MessageResponse>>,
  next: NextFunction
) {
  try {
    const runId = req.params.id;
    const userId = req.user!.id;

    const result = await pool.query(
      `DELETE FROM paper_runs
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [runId, userId]
    );

    if (!result.rowCount) {
      return sendError(res, "Paper run not found", 404);
    }

    return sendSuccess(res, { message: "Paper run deleted" });

  } catch (err) {
    next(err);
  }
}
