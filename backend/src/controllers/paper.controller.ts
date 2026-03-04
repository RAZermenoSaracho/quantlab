import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import {
  startPaperOnEngine,
  stopPaperOnEngine,
} from "../services/pythonEngine.service";
import { handlePaperEvent } from "../services/paperEvent.service";
import { PaperRunDetailResponseSchema, PaperEngineEventSchema} from "@quantlab/contracts";

/* =====================================================
   START PAPER RUN
===================================================== */
export async function startPaperRun(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const client = await pool.connect();

  try {
    const {
      algorithm_id,
      exchange,
      symbol,
      timeframe,
      initial_balance,
      fee_rate,
    } = req.body;

    if (!algorithm_id || !symbol || !timeframe || !initial_balance) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const parsedBalance = Number(initial_balance);
    if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) {
      return res.status(400).json({ error: "Invalid initial_balance" });
    }

    const userId = req.user!.id;

    const algoResult = await client.query(
      `SELECT code FROM algorithms WHERE id = $1 AND user_id = $2`,
      [algorithm_id, userId]
    );

    if (!algoResult.rowCount) {
      return res.status(404).json({ error: "Algorithm not found" });
    }

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
        algorithm_id,
        exchange ?? "binance",
        fee_rate ?? 0.001,
        symbol,
        timeframe,
        parsedBalance,
      ]
    );

    const runId: string = runInsert.rows[0].id;

    await client.query("COMMIT");

    res.status(201).json({ run_id: runId });

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
  res: Response,
  next: NextFunction
) {
  try {
    const rawId = req.params.id;

    if (!rawId || Array.isArray(rawId)) {
    return res.status(400).json({ error: "Invalid id parameter" });
    }

    const runId = rawId;
    const userId = req.user!.id;

    const runResult = await pool.query(
      `SELECT id FROM paper_runs WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (!runResult.rowCount) {
      return res.status(404).json({ error: "Paper run not found" });
    }

    await stopPaperOnEngine(runId);

    await pool.query(
      `UPDATE paper_runs
       SET status = 'STOPPED',
           updated_at = NOW()
       WHERE id = $1`,
      [runId]
    );

    return res.json({ message: "Paper run stopped" });

  } catch (err) {
    next(err);
  }
}

/* =====================================================
   INTERNAL ENGINE EVENT RECEIVER
===================================================== */
export async function receivePaperEvent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const event = PaperEngineEventSchema.parse(req.body);

    await handlePaperEvent(event);

    return res.json({ success: true });
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
  res: Response,
  next: NextFunction
) {
  try {
    const runId = req.params.id;
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
      return res.status(404).json({ error: "Paper run not found" });
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

      started_at: rawRun.started_at?.toISOString?.() ?? null,
      updated_at: rawRun.updated_at?.toISOString?.() ?? null,
    };

    /* =========================
       FETCH TRADES (NO SELECT *)
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
        pnl,
        pnl_percent,
        opened_at,
        closed_at
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
      run_type: t.run_type,

      side: t.side,

      entry_price: Number(t.entry_price),
      exit_price: t.exit_price != null ? Number(t.exit_price) : null,

      quantity: Number(t.quantity),

      pnl: t.pnl != null ? Number(t.pnl) : null,
      pnl_percent: t.pnl_percent != null ? Number(t.pnl_percent) : null,

      opened_at: t.opened_at?.toISOString?.() ?? null,
      closed_at: t.closed_at?.toISOString?.() ?? null,

      created_at: t.created_at?.toISOString?.() ?? null,

      forced_close: Boolean(t.forced_close),
    }));

    /* =========================
       STRICT CONTRACT VALIDATION
    ========================= */

    const response = PaperRunDetailResponseSchema.parse({
      run: normalizedRun,
      trades: normalizedTrades,
    });

    return res.json(response);
  } catch (err) {
    next(err);
  }
}

/* =====================================================
   GET ALL PAPER RUNS
===================================================== */
export async function getAllPaperRuns(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `
      SELECT
        p.id,
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
      started_at: r.started_at?.toISOString?.() ?? null,
    }));

    return res.json({ runs: normalizedRuns });
  } catch (err) {
    next(err);
  }
}

/* =====================================================
   DELETE PAPER RUN
===================================================== */
export async function deletePaperRun(
  req: Request,
  res: Response,
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
      return res.status(404).json({ error: "Paper run not found" });
    }

    return res.json({ message: "Paper run deleted" });

  } catch (err) {
    next(err);
  }
}