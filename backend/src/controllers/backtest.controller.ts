import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { runBacktestOnEngine } from "../services/backtestEngine.service";

/* ==============================
   CREATE
============================== */
export async function createBacktest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      algorithm_id,
      symbol,
      timeframe,
      initial_balance,
      start_date,
      end_date
    } = req.body;

    if (!algorithm_id || !symbol || !timeframe) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const userId = req.user!.id;

    // 🔎 Get algorithm
    const algoResult = await pool.query(
      `SELECT code FROM algorithms WHERE id = $1 AND user_id = $2`,
      [algorithm_id, userId]
    );

    if (!algoResult.rowCount) {
      return res.status(404).json({ error: "Algorithm not found" });
    }

    const code = algoResult.rows[0].code;

    // 🟡 Create run as RUNNING
    const runInsert = await pool.query(
      `INSERT INTO backtest_runs
       (user_id, algorithm_id, symbol, timeframe, initial_balance, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'RUNNING')
       RETURNING id`,
      [userId, algorithm_id, symbol, timeframe, initial_balance, start_date, end_date]
    );

    const runId = runInsert.rows[0].id;

    // 🚀 Call engine
    const engineResult = await runBacktestOnEngine({
      code,
      symbol,
      timeframe,
      initial_balance,
      start_date,
      end_date
    });

    /* METRICS */
    await pool.query(
      `INSERT INTO metrics
       (run_id, run_type, total_return_percent, total_return_usdt,
        max_drawdown_percent, win_rate_percent, profit_factor, total_trades)
       VALUES ($1,'BACKTEST',$2,$3,$4,$5,$6,$7)`,
      [
        runId,
        engineResult.total_return_percent,
        engineResult.total_return_usdt,
        engineResult.max_drawdown_percent,
        engineResult.win_rate_percent,
        engineResult.profit_factor,
        engineResult.total_trades
      ]
    );

    /* TRADES */
    for (const trade of engineResult.trades) {
      await pool.query(
        `INSERT INTO trades
         (run_id, run_type, side, entry_price, exit_price, quantity, pnl, opened_at, closed_at)
         VALUES ($1,'BACKTEST',$2,$3,$4,1,$5,NOW(),NOW())`,
        [
          runId,
          trade.entry_price < trade.exit_price ? "BUY" : "SELL",
          trade.entry_price,
          trade.exit_price,
          trade.net_pnl
        ]
      );
    }

    /* EQUITY + COMPLETE */
    await pool.query(
      `UPDATE backtest_runs
       SET equity_curve = $1,
           status = 'COMPLETED',
           updated_at = NOW()
       WHERE id = $2`,
      [engineResult.equity_curve, runId]
    );

    return res.status(201).json({ run_id: runId });

  } catch (err) {
    next(err);
  }
}

/* ==============================
   GET ONE
============================== */
export async function getBacktestById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const runResult = await pool.query(
      `SELECT *
       FROM backtest_runs
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!runResult.rowCount) {
      return res.status(404).json({ error: "Backtest not found" });
    }

    const run = runResult.rows[0];

    const metricsResult = await pool.query(
      `SELECT *
       FROM metrics
       WHERE run_id = $1 AND run_type = 'BACKTEST'`,
      [id]
    );

    const tradesResult = await pool.query(
      `SELECT *
       FROM trades
       WHERE run_id = $1 AND run_type = 'BACKTEST'
       ORDER BY created_at ASC`,
      [id]
    );

    return res.json({
      run,
      metrics: metricsResult.rows[0] || null,
      trades: tradesResult.rows,
      equity_curve: run.equity_curve || [],
    });

  } catch (err) {
    next(err);
  }
}

/* ==============================
   GET ALL  🔥 (THIS WAS MISSING)
============================== */
export async function getAllBacktests(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;

    const result = await pool.query(
      `
      SELECT 
        r.id,
        r.symbol,
        r.timeframe,
        r.status,
        r.created_at,
        m.total_return_percent,
        m.total_return_usdt,
        m.win_rate_percent,
        m.profit_factor
      FROM backtest_runs r
      LEFT JOIN metrics m 
        ON m.run_id = r.id AND m.run_type = 'BACKTEST'
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      `,
      [userId]
    );

    return res.json({ backtests: result.rows });

  } catch (err) {
    next(err);
  }
}

/* ==============================
   DELETE
============================== */
export async function deleteBacktest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = await pool.query(
      `DELETE FROM backtest_runs
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Backtest not found" });
    }

    return res.json({ message: "Backtest deleted" });

  } catch (err) {
    next(err);
  }
}
