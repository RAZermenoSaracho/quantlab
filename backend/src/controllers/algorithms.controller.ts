import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { validateAlgorithm } from "../services/pythonEngine.service";
import { fetchGithubFile } from "../services/github.service";

/* ==============================
   CREATE
============================== */
export async function createAlgorithm(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { name, notes_html, code, githubUrl } = req.body as {
      name?: string;
      notes_html?: string;
      code?: string;
      githubUrl?: string;
    };

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    let finalCode = code?.trim() || "";

    if (!finalCode && githubUrl) {
      finalCode = await fetchGithubFile(githubUrl);
    }

    if (!finalCode) {
      return res.status(400).json({ error: "Provide either code or GitHub URL" });
    }

    await validateAlgorithm(finalCode);

    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `INSERT INTO algorithms (user_id, name, notes_html, code, github_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, name, notes_html || null, finalCode, githubUrl || null]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/* ==============================
   UPDATE
============================== */
export async function updateAlgorithm(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const { name, notes_html, code } = req.body as {
      name?: string;
      notes_html?: string;
      code?: string;
    };

    if (!name || !code) {
      return res.status(400).json({ error: "Name and code required" });
    }

    await validateAlgorithm(code);

    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
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
      return res.status(404).json({ error: "Algorithm not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/* ==============================
   REFRESH FROM GITHUB
============================== */
export async function refreshAlgorithmFromGithub(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const found = await pool.query(
      `SELECT id, github_url
       FROM algorithms
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!found.rowCount) {
      return res.status(404).json({ error: "Algorithm not found" });
    }

    const githubUrl: string | null = found.rows[0].github_url;

    if (!githubUrl) {
      return res.status(400).json({
        error: "This algorithm was not created from GitHub",
      });
    }

    const newCode = await fetchGithubFile(githubUrl);
    await validateAlgorithm(newCode);

    const updated = await pool.query(
      `UPDATE algorithms
       SET code = $1,
           updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [newCode, id, userId]
    );

    return res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
}

/* ==============================
   GET ONE
============================== */
export async function getAlgorithmById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT *
       FROM algorithms
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Algorithm not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/* ==============================
   LIST
============================== */
export async function getAlgorithms(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `SELECT id, name, notes_html, github_url, created_at, updated_at
       FROM algorithms
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/* ==============================
   DELETE
============================== */
export async function deleteAlgorithm(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await pool.query(
      `DELETE FROM algorithms
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Algorithm not found" });
    }

    return res.json({ message: "Algorithm deleted" });
  } catch (err) {
    next(err);
  }
}

export async function getAlgorithmRuns(req: Request, res: Response) {
  const { id } = req.params;
  const userId = req.user!.id;

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

  res.json({
    backtests: backtests.rows,
    paperRuns: paperRuns.rows,
  });
}