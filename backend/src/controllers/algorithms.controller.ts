import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";
import { validateAlgorithm } from "../services/pythonEngine.service";
import { fetchGithubFile } from "../services/github.service";

/**
 * CREATE ALGORITHM
 */
export async function createAlgorithm(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { name, description, code, githubUrl } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    let finalCode = code;

    // 🔥 If GitHub URL provided, fetch code from GitHub
    if (!finalCode && githubUrl) {
      finalCode = await fetchGithubFile(githubUrl);
    }

    if (!finalCode) {
      return res.status(400).json({
        error: "You must provide either code or a GitHub file URL",
      });
    }

    // Validate with Python engine
    await validateAlgorithm(finalCode);

    const result = await pool.query(
      `INSERT INTO algorithms (user_id, name, description, code)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, created_at`,
      [req.user!.id, name, description || null, finalCode]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * LIST USER ALGORITHMS
 */
export async function getAlgorithms(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await pool.query(
      `SELECT id, name, description, created_at
       FROM algorithms
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.id]
    );

    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET ONE ALGORITHM
 */
export async function getAlgorithmById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, description, code, created_at
       FROM algorithms
       WHERE id = $1 AND user_id = $2`,
      [id, req.user!.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Algorithm not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE ALGORITHM
 */
export async function deleteAlgorithm(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM algorithms
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.user!.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Algorithm not found" });
    }

    return res.json({ message: "Algorithm deleted" });
  } catch (err) {
    next(err);
  }
}
