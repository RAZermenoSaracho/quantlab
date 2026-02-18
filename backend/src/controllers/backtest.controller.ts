import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { runBacktestOnEngine } from "../services/backtestEngine.service";

type DbTradeSide = "BUY" | "SELL";

function normalizeTradeSide(trade: any): DbTradeSide {
  const raw = String(trade?.side ?? "").toUpperCase().trim();

  // Engine might send LONG/SHORT or BUY/SELL
  if (raw === "LONG" || raw === "BUY") return "BUY";
  if (raw === "SHORT" || raw === "SELL") return "SELL";

  // fallback heuristic
  const entry = Number(trade?.entry_price ?? 0);
  const exit = Number(trade?.exit_price ?? 0);

  if (Number.isFinite(entry) && Number.isFinite(exit)) {
    return entry < exit ? "BUY" : "SELL";
  }

  // safest default
  return "BUY";
}

function toDateFromEngineTs(ts: any): Date {
  // Engine can send ms epoch, seconds epoch, or ISO string
  if (ts == null) return new Date();

  if (typeof ts === "number") {
    // heuristic: ms epoch usually > 10_000_000_000
    return ts > 10_000_000_000 ? new Date(ts) : new Date(ts * 1000);
  }

  const asNum = Number(ts);
  if (Number.isFinite(asNum)) {
    return asNum > 10_000_000_000 ? new Date(asNum) : new Date(asNum * 1000);
  }

  return new Date(String(ts));
}

/* ==============================
   CREATE
============================== */
export async function createBacktest(req: Request, res: Response, next: NextFunction) {
  let runId: string | null = null;

  try {
    const {
      algorithm_id,
      symbol,
      timeframe,
      initial_balance,
      start_date,
      end_date,
    } = req.body;

    if (!algorithm_id || !symbol || !timeframe || !initial_balance || !start_date || !end_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const userId = req.user!.id;

    /* ==============================
       GET ALGORITHM
    ============================== */
    const algoResult = await pool.query(
      `SELECT code FROM algorithms WHERE id = $1 AND user_id = $2`,
      [algorithm_id, userId]
    );

    if (!algoResult.rowCount) {
      return res.status(404).json({ error: "Algorithm not found" });
    }

    const code = algoResult.rows[0].code;

    /* ==============================
       CREATE RUN (RUNNING)
    ============================== */
    const runInsert = await pool.query(
      `INSERT INTO backtest_runs
       (user_id, algorithm_id, symbol, timeframe, initial_balance, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'RUNNING')
       RETURNING id`,
      [userId, algorithm_id, symbol, timeframe, initial_balance, start_date, end_date]
    );

    runId = runInsert.rows[0].id;

    /* ==============================
       CALL PYTHON ENGINE
    ============================== */
    const engineResult = await runBacktestOnEngine({
      code,
      symbol,
      timeframe,
      initial_balance,
      start_date,
      end_date,
    });

    /* ==============================
       INSERT METRICS (LEGACY TABLE)
    ============================== */
    await pool.query(
      `INSERT INTO metrics
       (run_id, run_type, total_return_percent, total_return_usdt,
        max_drawdown_percent, win_rate_percent, profit_factor, total_trades)
       VALUES ($1,'BACKTEST',$2,$3,$4,$5,$6,$7)`,
      [
        runId,
        engineResult.total_return_percent ?? 0,
        engineResult.total_return_usdt ?? 0,
        engineResult.max_drawdown_percent ?? 0,
        engineResult.win_rate_percent ?? 0,
        engineResult.profit_factor ?? 0,
        engineResult.total_trades ?? 0,
      ]
    );

    /* ==============================
       INSERT TRADES
       - Fix: trade_side enum only accepts BUY/SELL
       - Use opened_at/closed_at if engine provides
    ============================== */
    for (const trade of engineResult.trades ?? []) {
      const dbSide = normalizeTradeSide(trade);

      const entryPrice = Number(trade.entry_price ?? 0);
      const exitPrice = trade.exit_price == null ? null : Number(trade.exit_price);

      const quantity = Number(trade.quantity ?? 1);
      const pnl = Number(trade.pnl ?? trade.net_pnl ?? 0);

      // If engine doesn't provide pnl_percent, compute (simple) percent vs entry notional
      // (This is a placeholder until you compute it properly based on position sizing)
      const computedPnlPercent =
        trade.pnl_percent != null
          ? Number(trade.pnl_percent)
          : (entryPrice ? (pnl / entryPrice) * 100 : 0);

      const openedAt = trade.opened_at ? toDateFromEngineTs(trade.opened_at) : new Date();
      const closedAt = trade.closed_at ? toDateFromEngineTs(trade.closed_at) : new Date();

      await pool.query(
        `INSERT INTO trades
         (run_id, run_type, side, entry_price, exit_price, quantity, pnl, pnl_percent, opened_at, closed_at)
         VALUES ($1,'BACKTEST',$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          runId,
          dbSide, // ✅ BUY/SELL only
          entryPrice,
          exitPrice,
          quantity,
          pnl,
          computedPnlPercent,
          openedAt,
          closedAt,
        ]
      );
    }

    /* ==============================
       UPDATE RUN WITH EQUITY + ANALYSIS
       ⚠️ DO NOT JSON.stringify
    ============================== */
    await pool.query(
      `UPDATE backtest_runs
      SET equity_curve = $1::jsonb,
          analysis = $2::jsonb,
          status = 'COMPLETED',
          updated_at = NOW()
      WHERE id = $3`,
      [
        JSON.stringify(engineResult.equity_curve ?? []),
        JSON.stringify(engineResult.analysis ?? null),
        runId
      ]
    );

    return res.status(201).json({ run_id: runId });

  } catch (err) {
    console.error("Backtest creation error:", err);

    // Mark run as FAILED if it was created
    try {
      if (runId) {
        await pool.query(
          `UPDATE backtest_runs
           SET status = 'FAILED',
               updated_at = NOW()
           WHERE id = $1`,
          [runId]
        );
      }
    } catch (_) {
      // ignore
    }

    next(err);
  }
}

/* ==============================
   GET ONE
============================== */
export async function getBacktestById(req: Request, res: Response, next: NextFunction) {
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
      analysis: run.analysis || null,
      trades: tradesResult.rows,
      equity_curve: run.equity_curve || [],
    });

  } catch (err) {
    next(err);
  }
}

/* ==============================
   GET ALL
============================== */
export async function getAllBacktests(req: Request, res: Response, next: NextFunction) {
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
        r.analysis,
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
export async function deleteBacktest(req: Request, res: Response, next: NextFunction) {
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
