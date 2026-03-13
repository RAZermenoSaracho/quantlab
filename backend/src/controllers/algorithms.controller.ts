import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { validateAlgorithm } from "../services/pythonEngine.service";
import { fetchGithubFile } from "../services/github.service";

import {
  type Algorithm,
  type AlgorithmRankingResponse,
  type AlgorithmRunsResponse,
  type AlgorithmsListResponse,
  type ApiResponse,
  type BacktestRun,
  CreateAlgorithmSchema,
  type MessageResponse,
  type PaperRun,
  UpdateAlgorithmSchema,
} from "@quantlab/contracts";

import { sendError, sendSuccess } from "../utils/apiResponse";

type AlgorithmRow = Omit<Algorithm, "created_at" | "updated_at"> & {
  username?: string | null;
  is_public?: boolean | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AlgorithmOwnerRow = {
  user_id: string;
  is_public: boolean | null;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeAlgorithm(row: AlgorithmRow): Algorithm {
  return {
    ...row,
    username: row.username ?? null,
    is_public: Boolean(row.is_public),
    performance_score:
      row.performance_score != null ? Number(row.performance_score) : 0,
    avg_return_percent:
      row.avg_return_percent != null ? Number(row.avg_return_percent) : 0,
    avg_sharpe: row.avg_sharpe != null ? Number(row.avg_sharpe) : 0,
    avg_pnl: row.avg_pnl != null ? Number(row.avg_pnl) : 0,
    win_rate: row.win_rate != null ? Number(row.win_rate) : 0,
    max_drawdown: row.max_drawdown != null ? Number(row.max_drawdown) : 0,
    runs_count: row.runs_count != null ? Number(row.runs_count) : 0,
    calmar_ratio: row.calmar_ratio != null ? Number(row.calmar_ratio) : 0,
    sortino_ratio:
      row.sortino_ratio != null ? Number(row.sortino_ratio) : 0,
    return_stability:
      row.return_stability != null ? Number(row.return_stability) : 0,
    confidence_score:
      row.confidence_score != null ? Number(row.confidence_score) : 0,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

function serializeSummary(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    performance_score: Number(row.performance_score ?? 0),
    avg_return_percent: Number(row.avg_return_percent ?? 0),
    avg_sharpe: Number(row.avg_sharpe ?? 0),
    max_drawdown: Number(row.max_drawdown ?? 0),
    runs_count: Number(row.runs_count ?? 0),
    user_id: String(row.user_id),
    username:
      typeof row.username === "string" || row.username === null
        ? row.username
        : null,
    is_public: Boolean(row.is_public),
  };
}

async function getAlgorithmOwner(id: string) {
  const result = await pool.query<AlgorithmOwnerRow>(
    `
    SELECT user_id, is_public
    FROM algorithms
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] ?? null;
}

/* ==============================
   CREATE
============================== */
export async function createAlgorithm(
  req: Request,
  res: Response<ApiResponse<Algorithm>>,
  next: NextFunction
) {
  try {
    const parsed = CreateAlgorithmSchema.parse(req.body);

    const { name, notes_html, code, githubUrl, is_public } = parsed;

    let finalCode = code?.trim() || "";

    if (!finalCode && githubUrl) {
      finalCode = await fetchGithubFile(githubUrl);
    }

    if (!finalCode) {
      return sendError(res, "Provide either code or GitHub URL", 400);
    }

    await validateAlgorithm(finalCode);

    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const result = await pool.query<AlgorithmRow>(
      `INSERT INTO algorithms (user_id, name, notes_html, code, github_url, is_public)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, name, notes_html || null, finalCode, githubUrl || null, Boolean(is_public)]
    );

    return sendSuccess(res, serializeAlgorithm(result.rows[0]), 201);
  } catch (err) {
    next(err);
  }
}

/* ==============================
   UPDATE
============================== */
export async function updateAlgorithm(
  req: Request,
  res: Response<ApiResponse<Algorithm>>,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const existing = await pool.query<AlgorithmRow>(
      `
      SELECT *
      FROM algorithms
      WHERE id = $1
        AND user_id = $2
      `,
      [id, userId]
    );

    if (!existing.rowCount) {
      return sendError(res, "Algorithm not found", 404);
    }

    const parsed = UpdateAlgorithmSchema.parse(req.body);
    const current = existing.rows[0];

    const nextName = parsed.name ?? current.name;
    const nextNotes =
      parsed.notes_html !== undefined ? parsed.notes_html : current.notes_html;
    const nextCode = parsed.code ?? current.code;
    const nextIsPublic =
      parsed.is_public !== undefined ? parsed.is_public : Boolean(current.is_public);

    if (!nextName || !nextCode) {
      return sendError(res, "Name and code required", 400);
    }

    if (parsed.code !== undefined) {
      await validateAlgorithm(nextCode);
    }

    const result = await pool.query<AlgorithmRow>(
      `UPDATE algorithms
       SET name = $1,
           notes_html = $2,
           code = $3,
           is_public = $4,
           github_url = $5,
           updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        nextName,
        nextNotes || null,
        nextCode,
        nextIsPublic,
        parsed.code !== undefined ? null : current.github_url ?? null,
        id,
        userId,
      ]
    );

    return sendSuccess(res, serializeAlgorithm(result.rows[0]));
  } catch (err) {
    next(err);
  }
}

/* ==============================
   REFRESH FROM GITHUB
============================== */
export async function refreshAlgorithmFromGithub(
  req: Request,
  res: Response<ApiResponse<Algorithm>>,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const found = await pool.query(
      `SELECT id, github_url
       FROM algorithms
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!found.rowCount) {
      return sendError(res, "Algorithm not found", 404);
    }

    const githubUrl: string | null = found.rows[0].github_url;

    if (!githubUrl) {
      return sendError(
        res,
        "This algorithm was not created from GitHub",
        400
      );
    }

    const newCode = await fetchGithubFile(githubUrl);

    await validateAlgorithm(newCode);

    const updated = await pool.query<AlgorithmRow>(
      `UPDATE algorithms
       SET code = $1,
           updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [newCode, id, userId]
    );

    return sendSuccess(res, serializeAlgorithm(updated.rows[0]));
  } catch (err) {
    next(err);
  }
}

/* ==============================
   GET ONE
============================== */
export async function getAlgorithmById(
  req: Request,
  res: Response<ApiResponse<Algorithm>>,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const viewerId = req.user?.id ?? null;

    const result = await pool.query<AlgorithmRow>(
      `SELECT a.*, u.username
       FROM algorithms a
       INNER JOIN users u
         ON u.id = a.user_id
       WHERE a.id = $1`,
      [id]
    );

    if (!result.rowCount) {
      return sendError(res, "Algorithm not found", 404);
    }

    const row = result.rows[0];
    const isOwner = viewerId === row.user_id;

    if (!Boolean(row.is_public) && !isOwner) {
      row.code = "[Private Algorithm]";
      row.github_url = null;
    }

    return sendSuccess(res, serializeAlgorithm(row));
  } catch (err) {
    next(err);
  }
}

/* ==============================
   LIST
============================== */
export async function getAlgorithms(
  req: Request,
  res: Response<ApiResponse<AlgorithmsListResponse>>,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const result = await pool.query<AlgorithmRow>(
      `SELECT a.id, a.user_id, u.username, a.name, a.notes_html, a.github_url, a.code,
              a.is_public, a.performance_score, a.avg_return_percent, a.avg_sharpe, a.avg_pnl,
              a.win_rate, a.max_drawdown, a.runs_count,
              a.calmar_ratio, a.sortino_ratio, a.return_stability, a.confidence_score,
              a.created_at, a.updated_at
       FROM algorithms a
       INNER JOIN users u
         ON u.id = a.user_id
       WHERE a.user_id = $1
       ORDER BY a.performance_score DESC NULLS LAST, a.created_at DESC`,
      [userId]
    );

    return sendSuccess(res, {
      algorithms: result.rows.map(serializeAlgorithm),
    });
  } catch (err) {
    next(err);
  }
}

/* ==============================
   RANKING
============================== */
export async function getAlgorithmRanking(
  _req: Request,
  res: Response<ApiResponse<AlgorithmRankingResponse>>,
  next: NextFunction
) {
  try {
    const result = await pool.query(
      `
      SELECT a.id,
             a.name,
             COALESCE(a.performance_score, 0) AS performance_score,
             COALESCE(a.avg_return_percent, 0) AS avg_return_percent,
             COALESCE(a.avg_sharpe, 0) AS avg_sharpe,
             COALESCE(a.max_drawdown, 0) AS max_drawdown,
             COALESCE(a.runs_count, 0) AS runs_count,
             a.user_id,
             u.username,
             COALESCE(a.is_public, false) AS is_public
      FROM algorithms a
      INNER JOIN users u
        ON u.id = a.user_id
      ORDER BY a.performance_score DESC NULLS LAST, a.created_at DESC
      LIMIT 50
      `
    );

    return sendSuccess(res, {
      algorithms: result.rows.map(serializeSummary),
    });
  } catch (err) {
    next(err);
  }
}

/* ==============================
   DELETE
============================== */
export async function deleteAlgorithm(
  req: Request,
  res: Response<ApiResponse<MessageResponse>>,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const result = await pool.query(
      `DELETE FROM algorithms
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (!result.rowCount) {
      return sendError(res, "Algorithm not found", 404);
    }

    return sendSuccess(res, { message: "Algorithm deleted" });
  } catch (err) {
    next(err);
  }
}

/* ==============================
   GET RUNS
============================== */
export async function getAlgorithmRuns(
  req: Request,
  res: Response<ApiResponse<AlgorithmRunsResponse>>,
  next: NextFunction
) {
  try {
    const id = String(req.params.id);
    const viewerId = req.user?.id ?? null;

    const algorithm = await getAlgorithmOwner(id);

    if (!algorithm) {
      return sendError(res, "Algorithm not found", 404);
    }

    const isOwner = viewerId === algorithm.user_id;
    void isOwner;

    const backtests = await pool.query<
      Pick<
        BacktestRun,
        | "id"
        | "exchange"
        | "symbol"
        | "timeframe"
        | "status"
        | "created_at"
        | "start_date"
        | "end_date"
        | "total_return_percent"
        | "total_return_usdt"
        | "sharpe_ratio"
      >
    >(
      `
      SELECT r.id, r.exchange, r.symbol, r.timeframe, r.status,
             r.created_at, r.start_date, r.end_date,
             m.total_return_percent,
             m.total_return_usdt,
             m.sharpe_ratio
      FROM backtest_runs r
      LEFT JOIN metrics m
        ON m.run_id = r.id AND m.run_type = 'BACKTEST'
      WHERE r.algorithm_id = $1
      ORDER BY r.created_at DESC
      LIMIT 50
      `,
      [id]
    );

    const paperRuns = await pool.query<
      Pick<
        PaperRun,
        | "id"
        | "exchange"
        | "symbol"
        | "timeframe"
        | "status"
        | "initial_balance"
        | "current_balance"
        | "quote_balance"
        | "base_balance"
        | "equity"
        | "last_price"
        | "pnl"
        | "win_rate_percent"
      > & { started_at: Date | string | null }
    >(
      `
      SELECT id, exchange, symbol, timeframe, status,
             initial_balance, current_balance, quote_balance, base_balance, equity, last_price,
             started_at,
             CASE
               WHEN equity IS NOT NULL THEN (equity - initial_balance)
               ELSE 0
             END AS pnl,
             COALESCE(pwr.win_rate_percent, 0) AS win_rate_percent
      FROM paper_runs
      LEFT JOIN (
        SELECT
          t.run_id,
          CASE
            WHEN COUNT(*) FILTER (WHERE t.net_pnl IS NOT NULL) > 0
              THEN (
                COUNT(*) FILTER (WHERE t.net_pnl > 0)::float
                / COUNT(*) FILTER (WHERE t.net_pnl IS NOT NULL)::float
              ) * 100
            ELSE 0
          END AS win_rate_percent
        FROM trades t
        WHERE t.run_type = 'PAPER'
        GROUP BY t.run_id
      ) pwr ON pwr.run_id = paper_runs.id
      WHERE algorithm_id = $1
      ORDER BY started_at DESC
      LIMIT 50
      `,
      [id]
    );

    return sendSuccess(res, {
      backtests: backtests.rows.map((row) => ({
        id: row.id,
        exchange: row.exchange,
        symbol: row.symbol,
        timeframe: row.timeframe,
        status: row.status,
        created_at: toIsoString(row.created_at),
        start_date: row.start_date ? toIsoString(row.start_date) : null,
        end_date: row.end_date ? toIsoString(row.end_date) : null,
        total_return_percent:
          row.total_return_percent != null
            ? Number(row.total_return_percent)
            : null,
        total_return_usdt:
          row.total_return_usdt != null
            ? Number(row.total_return_usdt)
            : null,
        sharpe_ratio:
          row.sharpe_ratio != null
            ? Number(row.sharpe_ratio)
            : null,
      })),
      paperRuns: paperRuns.rows.map((row) => ({
        id: row.id,
        exchange: row.exchange,
        symbol: row.symbol,
        timeframe: row.timeframe,
        status: row.status,
        initial_balance: Number(row.initial_balance),
        current_balance: Number(row.current_balance),
        quote_balance:
          row.quote_balance != null ? Number(row.quote_balance) : null,
        base_balance:
          row.base_balance != null ? Number(row.base_balance) : null,
        equity: row.equity != null ? Number(row.equity) : null,
        last_price: row.last_price != null ? Number(row.last_price) : null,
        started_at: row.started_at ? toIsoString(row.started_at) : null,
        pnl: row.pnl != null ? Number(row.pnl) : null,
        win_rate_percent:
          row.win_rate_percent != null ? Number(row.win_rate_percent) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
}
