import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { runBacktestOnEngine, getEngineProgress } from "../services/backtestEngine.service";
import { getExchangeById } from "../services/exchangeCatalog.service";
import { toDateFromEngineTs } from "../utils/dateUtils";
import { normalizeTradeSide } from "../utils/tradeUtils";

/* ==============================
   CREATE
============================== */
export async function createBacktest(
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
      start_date,
      end_date,
      fee_rate
    } = req.body;

    if (
      !algorithm_id ||
      !exchange ||
      !symbol ||
      !timeframe ||
      !initial_balance ||
      !start_date ||
      !end_date
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const parsedBalance = Number(initial_balance);
    if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) {
      return res.status(400).json({ error: "Invalid initial_balance" });
    }

    const userId = req.user!.id;

    const exchangeMeta = getExchangeById(exchange);
    if (!exchangeMeta) {
      return res.status(400).json({ error: "Unsupported exchange" });
    }

    const finalFeeRate =
      typeof fee_rate === "number"
        ? fee_rate
        : exchangeMeta.default_fee_rate;

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
      `INSERT INTO backtest_runs
       (user_id, algorithm_id, exchange, fee_rate, symbol, timeframe,
        initial_balance, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RUNNING')
       RETURNING id`,
      [
        userId,
        algorithm_id,
        exchange,
        finalFeeRate,
        symbol,
        timeframe,
        parsedBalance,
        start_date,
        end_date
      ]
    );

    const runId: string = runInsert.rows[0].id;

    await client.query("COMMIT");

    res.status(201).json({ run_id: runId });

    runBacktestWorker(runId, {
      code,
      exchange,
      symbol,
      timeframe,
      initial_balance: parsedBalance,
      start_date,
      end_date,
      fee_rate: finalFeeRate
    });

  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

async function runBacktestWorker(runId: string, payload: any) {
  const client = await pool.connect();

  try {
    const engineResult = await runBacktestOnEngine(runId, payload);

    await client.query("BEGIN");

    // INSERT METRICS
    await client.query(
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
        engineResult.total_trades ?? 0
      ]
    );

    // INSERT TRADES (con normalizeTradeSide)
    for (const trade of engineResult.trades ?? []) {
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
        VALUES ($1,'BACKTEST',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
          forcedClose
        ]
      );
    }

    // FINAL UPDATE
    await client.query(
      `UPDATE backtest_runs
      SET equity_curve = $1::jsonb,
          analysis = $2::jsonb,
          candles = $3::jsonb,
          candles_count = $4,
          candles_start_ts = $5,
          candles_end_ts = $6,
          open_positions_at_end = $7,
          had_forced_close = $8,
          status = 'COMPLETED',
          updated_at = NOW()
      WHERE id = $9`,
      [
        JSON.stringify(engineResult.equity_curve ?? []),
        JSON.stringify(engineResult.analysis ?? null),
        JSON.stringify(engineResult.candles ?? []),
        engineResult.candles_count ?? 0,
        engineResult.candles_start_ts ?? null,
        engineResult.candles_end_ts ?? null,
        engineResult.open_positions_at_end ?? 0,
        engineResult.had_forced_close ?? false,
        runId
      ]
    );

    await client.query("COMMIT");

  } catch (err) {
    await client.query("ROLLBACK");

    await client.query(
      `UPDATE backtest_runs
       SET status = 'FAILED'
       WHERE id = $1`,
      [runId]
    );
  } finally {
    client.release();
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
      `
      SELECT 
        r.*,
        a.name AS algorithm_name,
        a.notes_html AS algorithm_description
      FROM backtest_runs r
      JOIN algorithms a ON a.id = r.algorithm_id
      WHERE r.id = $1 AND r.user_id = $2
      `,
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
      candles: run.candles || [],
      candles_count: run.candles_count || 0,
      candles_start_ts: run.candles_start_ts || null,
      candles_end_ts: run.candles_end_ts || null,

      open_positions_at_end: run.open_positions_at_end || 0,
      had_forced_close: run.had_forced_close || false,
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
      r.exchange,
      r.algorithm_id,
      a.name AS algorithm_name,
      m.total_return_percent,
      m.total_return_usdt,
      m.total_trades
    FROM backtest_runs r
    LEFT JOIN algorithms a 
      ON a.id = r.algorithm_id
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

export async function getBacktestStatus(req: Request, res: Response) {
  const rawId = req.params.id;

  if (!rawId || Array.isArray(rawId)) {
    return res.status(400).json({ error: "Invalid id parameter" });
  }

  const id = rawId;

  const engineProgress = await getEngineProgress(id);

  return res.json({
    status: engineProgress.progress >= 100 ? "COMPLETED" : "RUNNING",
    progress: engineProgress.progress,
  });
}