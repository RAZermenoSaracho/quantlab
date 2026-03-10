import type { Request, Response, NextFunction } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { runBacktestOnEngine, getEngineProgress } from "../services/backtestEngine.service";
import { getExchangeById } from "../services/exchangeCatalog.service";
import { toDateFromEngineTs, toIsoOrNull } from "../utils/dateUtils";
import { normalizeTradeSide } from "../utils/tradeUtils";
import {
  type ApiResponse,
  type BacktestDetailResponse,
  type BacktestStatusResponse,
  type BacktestsListResponse,
  type CreateBacktestRequest,
  MarketTimeframeSchema,
  type CreateBacktestResponse,
  type MessageResponse,
} from "@quantlab/contracts";
import { sendError, sendSuccess } from "../utils/apiResponse";
import { z } from "zod";
import { getConcurrentRunsCount } from "../services/runConcurrency.service";

type RunBacktestPayload = Omit<CreateBacktestRequest, "algorithm_id"> & {
  code: string;
  initial_balance: number;
  fee_rate: number;
};

const CreateBacktestLegacyRequestSchema = z
  .object({
    algorithm_id: z.string().uuid().optional(),
    code: z.string().min(1).optional(),
    exchange: z.string(),
    symbol: z.string(),
    timeframe: MarketTimeframeSchema,
    initial_balance: z.number().positive(),
    start_date: z.string(),
    end_date: z.string(),
    fee_rate: z.number().optional(),
  })
  .refine((value) => Boolean(value.algorithm_id || value.code), {
    message: "Either algorithm_id or code is required",
  });

/* ==============================
   CREATE
============================== */
export async function createBacktest(
  req: Request,
  res: Response<ApiResponse<CreateBacktestResponse>>,
  next: NextFunction
) {
  const client = await pool.connect();

  try {
    const payload = CreateBacktestLegacyRequestSchema.parse(req.body);

    const parsedBalance = Number(payload.initial_balance);
    if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) {
      return sendError(res, "Invalid initial_balance", 400);
    }

    const userId = req.user!.id;
    const concurrentRuns = await getConcurrentRunsCount(userId);
    if (concurrentRuns >= 20) {
      return sendError(res, "Maximum concurrent runs reached", 429);
    }

    const exchangeMeta = getExchangeById(payload.exchange);
    if (!exchangeMeta) {
      return sendError(res, "Unsupported exchange", 400);
    }

    const finalFeeRate =
      typeof payload.fee_rate === "number"
        ? payload.fee_rate
        : exchangeMeta.default_fee_rate;

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

    const runId = await createBacktestRunRecord(client, {
      userId,
      algorithmId,
      exchange: payload.exchange,
      feeRate: finalFeeRate,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      initialBalance: parsedBalance,
      startDate: payload.start_date,
      endDate: payload.end_date,
    });

    sendSuccess(res, { run_id: runId }, 201);

    runBacktestWorker(runId, {
      code,
      exchange: payload.exchange,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      initial_balance: parsedBalance,
      start_date: payload.start_date,
      end_date: payload.end_date,
      fee_rate: finalFeeRate
    });

  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

async function createBacktestRunRecord(
  client: PoolClient,
  params: {
    userId: string;
    algorithmId: string;
    exchange: string;
    feeRate: number;
    symbol: string;
    timeframe: CreateBacktestRequest["timeframe"];
    initialBalance: number;
    startDate: string;
    endDate: string;
  }
): Promise<string> {
  await client.query("BEGIN");

  const runInsert = await client.query(
    `INSERT INTO backtest_runs
     (user_id, algorithm_id, exchange, fee_rate, symbol, timeframe,
      initial_balance, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RUNNING')
     RETURNING id`,
    [
      params.userId,
      params.algorithmId,
      params.exchange,
      params.feeRate,
      params.symbol,
      params.timeframe,
      params.initialBalance,
      params.startDate,
      params.endDate,
    ]
  );

  await client.query("COMMIT");
  return String(runInsert.rows[0].id);
}

async function runBacktestWorker(runId: string, payload: RunBacktestPayload) {
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

    // Insert trades using normalized side values.
    for (const trade of engineResult.trades ?? []) {
      const dbSide = normalizeTradeSide(trade);

      const entryPrice = Number(trade.entry_price ?? 0);
      const exitPrice =
        trade.exit_price == null ? null : Number(trade.exit_price);
      const quantity = Number(trade.quantity ?? 1);
      const entryNotional = Number(
        trade.entry_notional ?? entryPrice * quantity
      );
      const exitNotional =
        exitPrice == null ? null : Number(trade.exit_notional ?? exitPrice * quantity);
      const feeRateUsed = Number(trade.fee_rate_used ?? payload.fee_rate ?? 0);
      const entryFee = Number(trade.entry_fee ?? entryNotional * feeRateUsed);
      const exitFee =
        exitNotional == null ? null : Number(trade.exit_fee ?? exitNotional * feeRateUsed);
      const totalFee = Number(
        trade.total_fee ??
          (entryFee + (exitFee ?? 0))
      );
      const grossPnl = Number(
        trade.gross_pnl ??
          (dbSide === "SHORT"
            ? (entryPrice - (exitPrice ?? entryPrice)) * quantity
            : ((exitPrice ?? entryPrice) - entryPrice) * quantity)
      );
      const netPnl = Number(trade.net_pnl ?? trade.pnl ?? grossPnl - totalFee);
      const pnl = netPnl;

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
        (run_id, run_type, symbol, side, entry_price, exit_price,
          quantity, entry_notional, exit_notional, entry_fee, exit_fee, total_fee,
          gross_pnl, net_pnl, fee_rate_used, pnl, pnl_percent, opened_at, closed_at, forced_close)
        VALUES ($1,'BACKTEST',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          runId,
          String((trade as { symbol?: string }).symbol ?? payload.symbol).toUpperCase(),
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
export async function getBacktestById(
  req: Request,
  res: Response<ApiResponse<BacktestDetailResponse>>,
  next: NextFunction
) {
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
      return sendError(res, "Backtest not found", 404);
    }

    const rawRun = runResult.rows[0];

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

    const run = {
      ...rawRun,

      created_at:
        rawRun.created_at instanceof Date
          ? rawRun.created_at.toISOString()
          : rawRun.created_at,

      updated_at:
        rawRun.updated_at instanceof Date
          ? rawRun.updated_at.toISOString()
          : rawRun.updated_at,

      candles_start_ts:
        rawRun.candles_start_ts != null
          ? Number(rawRun.candles_start_ts)
          : null,

      candles_end_ts:
        rawRun.candles_end_ts != null
          ? Number(rawRun.candles_end_ts)
          : null,

      start_date:
        rawRun.start_date instanceof Date
          ? rawRun.start_date.toISOString()
          : rawRun.start_date,

      end_date:
        rawRun.end_date instanceof Date
          ? rawRun.end_date.toISOString()
          : rawRun.end_date,

      fee_rate:
        rawRun.fee_rate != null
          ? Number(rawRun.fee_rate)
          : null,

      initial_balance:
        rawRun.initial_balance != null
          ? Number(rawRun.initial_balance)
          : null,
    };

    const response: BacktestDetailResponse = {
      run,
      metrics: metricsResult.rows[0] || null,
      analysis: run.analysis || null,
      trades: tradesResult.rows.map((trade) => ({
        ...trade,
        entry_price: Number(trade.entry_price),
        exit_price:
          trade.exit_price != null ? Number(trade.exit_price) : null,
        quantity: Number(trade.quantity),
        entry_notional:
          trade.entry_notional != null ? Number(trade.entry_notional) : null,
        exit_notional:
          trade.exit_notional != null ? Number(trade.exit_notional) : null,
        entry_fee: trade.entry_fee != null ? Number(trade.entry_fee) : null,
        exit_fee: trade.exit_fee != null ? Number(trade.exit_fee) : null,
        total_fee: trade.total_fee != null ? Number(trade.total_fee) : null,
        gross_pnl: trade.gross_pnl != null ? Number(trade.gross_pnl) : null,
        net_pnl: trade.net_pnl != null ? Number(trade.net_pnl) : null,
        fee_rate_used:
          trade.fee_rate_used != null ? Number(trade.fee_rate_used) : null,
        pnl: trade.pnl != null ? Number(trade.pnl) : Number(trade.net_pnl ?? 0),
        pnl_percent: Number(trade.pnl_percent ?? 0),
        opened_at: toIsoOrNull(trade.opened_at) ?? new Date().toISOString(),
        closed_at: toIsoOrNull(trade.closed_at),
        created_at: toIsoOrNull(trade.created_at),
      })),
      equity_curve: run.equity_curve || [],
      candles: run.candles || [],
      candles_count: run.candles_count || 0,
      candles_start_ts: run.candles_start_ts,
      candles_end_ts: run.candles_end_ts,
      open_positions_at_end: run.open_positions_at_end || 0,
      had_forced_close: run.had_forced_close || false,
    };

    return sendSuccess(res, response);

  } catch (err) {
    next(err);
  }
}

/* ==============================
   GET ALL
============================== */
export async function getAllBacktests(
  req: Request,
  res: Response<ApiResponse<BacktestsListResponse>>,
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

    const normalized = result.rows.map((row) => ({
      ...row,

      total_return_percent:
        row.total_return_percent != null
          ? Number(row.total_return_percent)
          : null,

      total_return_usdt:
        row.total_return_usdt != null
          ? Number(row.total_return_usdt)
          : null,

      total_trades:
        row.total_trades != null
          ? Number(row.total_trades)
          : null,

      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    }));

    return sendSuccess(res, {
      backtests: normalized,
    });

  } catch (err) {
    next(err);
  }
}

/* ==============================
   DELETE
============================== */
export async function deleteBacktest(
  req: Request,
  res: Response<ApiResponse<MessageResponse>>,
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
      return sendError(res, "Backtest not found", 404);
    }

    return sendSuccess(res, { message: "Backtest deleted" });

  } catch (err) {
    next(err);
  }
}

export async function getBacktestStatus(
  req: Request,
  res: Response<ApiResponse<BacktestStatusResponse>>
) {
  const rawId = req.params.id;

  if (!rawId || Array.isArray(rawId)) {
    return sendError(res, "Invalid id parameter", 400);
  }

  const id = rawId;
  const userId = req.user?.id;

  if (!userId) {
    return sendError(res, "Unauthorized", 401);
  }

  const owned = await pool.query(
    `SELECT id
     FROM backtest_runs
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (!owned.rowCount) {
    return sendError(res, "Backtest not found", 404);
  }

  const engineProgress = await getEngineProgress(id);
  const progress = engineProgress;

  return sendSuccess(res, {
    status: progress >= 100 ? "COMPLETED" : "RUNNING",
    progress,
  });
}

export async function rerunBacktest(
  req: Request,
  res: Response<ApiResponse<{ id: string; status: "started" }>>,
  next: NextFunction
) {
  const client = await pool.connect();

  try {
    const rawId = req.params.id;
    if (!rawId || Array.isArray(rawId)) {
      return sendError(res, "Invalid id parameter", 400);
    }

    const userId = req.user!.id;
    const concurrentRuns = await getConcurrentRunsCount(userId);
    if (concurrentRuns >= 20) {
      return sendError(res, "Maximum concurrent runs reached", 429);
    }

    const existingRunResult = await client.query(
      `
      SELECT
        r.algorithm_id,
        r.exchange,
        r.symbol,
        r.timeframe,
        r.initial_balance,
        r.start_date,
        r.end_date,
        r.fee_rate,
        a.code
      FROM backtest_runs r
      JOIN algorithms a ON a.id = r.algorithm_id
      WHERE r.id = $1 AND r.user_id = $2
      `,
      [rawId, userId]
    );

    if (!existingRunResult.rowCount) {
      return sendError(res, "Backtest not found", 404);
    }

    const run = existingRunResult.rows[0];
    const newRunId = await createBacktestRunRecord(client, {
      userId,
      algorithmId: String(run.algorithm_id),
      exchange: String(run.exchange),
      feeRate: Number(run.fee_rate ?? 0),
      symbol: String(run.symbol),
      timeframe: run.timeframe as CreateBacktestRequest["timeframe"],
      initialBalance: Number(run.initial_balance ?? 0),
      startDate:
        run.start_date instanceof Date
          ? run.start_date.toISOString()
          : String(run.start_date),
      endDate:
        run.end_date instanceof Date
          ? run.end_date.toISOString()
          : String(run.end_date),
    });

    void runBacktestWorker(newRunId, {
      code: String(run.code),
      exchange: String(run.exchange),
      symbol: String(run.symbol),
      timeframe: run.timeframe as CreateBacktestRequest["timeframe"],
      initial_balance: Number(run.initial_balance ?? 0),
      start_date:
        run.start_date instanceof Date
          ? run.start_date.toISOString()
          : String(run.start_date),
      end_date:
        run.end_date instanceof Date
          ? run.end_date.toISOString()
          : String(run.end_date),
      fee_rate: Number(run.fee_rate ?? 0),
    });

    return sendSuccess(res, { id: newRunId, status: "started" });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}
