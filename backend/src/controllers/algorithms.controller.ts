import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { validateAlgorithm } from "../services/pythonEngine.service";
import { fetchGithubFile } from "../services/github.service";

import {
  type Algorithm,
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
  created_at: Date | string;
  updated_at: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeAlgorithm(row: AlgorithmRow): Algorithm {
  return {
    ...row,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
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

    const { name, notes_html, code, githubUrl } = parsed;

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
      `INSERT INTO algorithms (user_id, name, notes_html, code, github_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, name, notes_html || null, finalCode, githubUrl || null]
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

    const parsed = UpdateAlgorithmSchema.parse(req.body);

    const { name, notes_html, code } = parsed;

    if (!name || !code) {
      return sendError(res, "Name and code required", 400);
    }

    await validateAlgorithm(code);

    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const result = await pool.query<AlgorithmRow>(
      `UPDATE algorithms
       SET name = $1,
           notes_html = $2,
           code = $3,
           github_url = NULL,
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, notes_html || null, code, id, userId]
    );

    if (!result.rowCount) {
      return sendError(res, "Algorithm not found", 404);
    }

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

    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const result = await pool.query<AlgorithmRow>(
      `SELECT *
       FROM algorithms
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!result.rowCount) {
      return sendError(res, "Algorithm not found", 404);
    }

    return sendSuccess(res, serializeAlgorithm(result.rows[0]));
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
      `SELECT id, name, notes_html, github_url, created_at, updated_at
       FROM algorithms
       WHERE user_id = $1
       ORDER BY created_at DESC`,
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
    const { id } = req.params;

    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const backtests = await pool.query(
      `
      SELECT r.id, r.symbol, r.timeframe, r.status,
             r.created_at,
             m.total_return_percent,
             m.total_return_usdt
      FROM backtest_runs r
      LEFT JOIN metrics m
        ON m.run_id = r.id AND m.run_type = 'BACKTEST'
      WHERE r.algorithm_id = $1
        AND r.user_id = $2
      ORDER BY r.created_at DESC
      `,
      [id, userId]
    );

    const paperRuns = await pool.query(
      `
      SELECT id, symbol, timeframe, status,
             initial_balance, current_balance,
             started_at
      FROM paper_runs
      WHERE algorithm_id = $1
        AND user_id = $2
      ORDER BY started_at DESC
      `,
      [id, userId]
    );

    return sendSuccess(res, {
      backtests: backtests.rows.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        timeframe: row.timeframe,
        status: row.status,
        created_at: toIsoString(row.created_at),
        total_return_percent:
          row.total_return_percent != null
            ? Number(row.total_return_percent)
            : null,
        total_return_usdt:
          row.total_return_usdt != null
            ? Number(row.total_return_usdt)
            : null,
      })),
      paperRuns: paperRuns.rows.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        timeframe: row.timeframe,
        status: row.status,
        initial_balance: Number(row.initial_balance),
        current_balance: Number(row.current_balance),
        started_at:
          row.started_at instanceof Date ? row.started_at.toISOString() : null,
      })),
    });
  } catch (err) {
    next(err);
  }
}
