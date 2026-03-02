import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import {
  startPaperOnEngine,
  stopPaperOnEngine,
} from "../services/pythonEngine.service";
import { handlePaperEvent } from "../services/paperEvent.service";

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
    const event = req.body;

    await handlePaperEvent(event);

    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
}

/* =====================================================
   GET ONE PAPER RUN
===================================================== */
export async function getPaperRunById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const runId = req.params.id;
    const userId = req.user!.id;

    const runResult = await pool.query(
      `SELECT *
       FROM paper_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, userId]
    );

    if (!runResult.rowCount) {
      return res.status(404).json({ error: "Paper run not found" });
    }

    const tradesResult = await pool.query(
      `SELECT *
       FROM trades
       WHERE run_id = $1 AND run_type = 'PAPER'
       ORDER BY created_at ASC`,
      [runId]
    );

    return res.json({
      run: runResult.rows[0],
      trades: tradesResult.rows,
    });

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

    return res.json({ runs: result.rows });

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