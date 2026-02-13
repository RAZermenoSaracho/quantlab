import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { AuthRequest } from "../middleware/auth.middleware";
import { runBacktestOnEngine } from "../services/backtestEngine.service";

export async function createBacktest(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const { algorithm_id, symbol, timeframe, initial_balance, start_date, end_date } = req.body;

        if (!algorithm_id || !symbol || !timeframe) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // 1️⃣ Get algorithm code
        const algoResult = await pool.query(
            `SELECT code FROM algorithms WHERE id = $1 AND user_id = $2`,
            [algorithm_id, req.user!.id]
        );

        if (algoResult.rows.length === 0) {
            return res.status(404).json({ error: "Algorithm not found" });
        }

        const code = algoResult.rows[0].code;

        // 2️⃣ Create backtest_run with RUNNING
        const runResult = await pool.query(
            `INSERT INTO backtest_runs 
        (user_id, algorithm_id, symbol, timeframe, initial_balance, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'RUNNING')
       RETURNING id`,
            [
                req.user!.id,
                algorithm_id,
                symbol,
                timeframe,
                initial_balance,
                start_date,
                end_date
            ]
        );

        const runId = runResult.rows[0].id;

        // 3️⃣ Call engine
        const engineResult = await runBacktestOnEngine({
            code,
            symbol,
            timeframe,
            initial_balance,
            start_date,
            end_date
        });

        // 4️⃣ Save trades
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

        // 5️⃣ Save metrics
        await pool.query(
            `INSERT INTO metrics
        (run_id, run_type, total_return_percent, total_return_usdt,
         max_drawdown_percent, win_rate_percent, profit_factor, total_trades)
       VALUES ($1,'BACKTEST',$2,$3,$4,$5,$6,$7)`,
            [
                runId,
                engineResult.total_return_pct,
                engineResult.total_return,
                engineResult.max_drawdown_pct,
                engineResult.win_rate_pct,
                engineResult.profit_factor,
                engineResult.total_trades
            ]
        );

        // 6️⃣ Mark as COMPLETED
        await pool.query(
            `UPDATE backtest_runs SET status='COMPLETED', updated_at=NOW() WHERE id=$1`,
            [runId]
        );

        return res.status(201).json({
            run_id: runId,
            ...engineResult
        });

    } catch (err) {
        next(err);
    }
}

export async function getBacktestById(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const { id } = req.params;

        // 1️⃣ Verificar que el run pertenece al usuario
        const runResult = await pool.query(
            `SELECT * FROM backtest_runs 
       WHERE id = $1 AND user_id = $2`,
            [id, req.user!.id]
        );

        if (runResult.rows.length === 0) {
            return res.status(404).json({ error: "Backtest not found" });
        }

        const run = runResult.rows[0];

        // 2️⃣ Obtener métricas
        const metricsResult = await pool.query(
            `SELECT * FROM metrics 
       WHERE run_id = $1 AND run_type = 'BACKTEST'`,
            [id]
        );

        // 3️⃣ Obtener trades
        const tradesResult = await pool.query(
            `SELECT * FROM trades 
       WHERE run_id = $1 AND run_type = 'BACKTEST'
       ORDER BY created_at ASC`,
            [id]
        );

        return res.json({
            run,
            metrics: metricsResult.rows[0] || null,
            trades: tradesResult.rows
        });

    } catch (err) {
        next(err);
    }
}

export async function getAllBacktests(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;

    const result = await pool.query(
      `
      SELECT 
        r.id,
        r.symbol,
        r.timeframe,
        r.status,
        r.created_at,
        m.total_return_percent,
        m.win_rate_percent,
        m.profit_factor
      FROM backtest_runs r
      LEFT JOIN metrics m ON m.run_id = r.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
      `,
      [userId]
    );

    res.json({ backtests: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch backtests" });
  }
}
