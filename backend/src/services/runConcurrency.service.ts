import { pool } from "../config/db";

const MAX_CONCURRENT_RUNS_PER_USER = 20;

export async function getConcurrentRunsCount(userId: string): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `
    SELECT
      (
        SELECT COUNT(*)::int
        FROM backtest_runs
        WHERE user_id = $1
          AND LOWER(status::text) = 'running'
      ) +
      (
        SELECT COUNT(*)::int
        FROM paper_runs
        WHERE user_id = $1
          AND LOWER(status::text) IN ('active', 'running')
      ) AS total
    `,
    [userId]
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function ensureRunCapacityOrThrow(userId: string): Promise<void> {
  const total = await getConcurrentRunsCount(userId);
  if (total >= MAX_CONCURRENT_RUNS_PER_USER) {
    const error = new Error("Maximum concurrent runs reached");
    (error as Error & { statusCode?: number }).statusCode = 429;
    throw error;
  }
}

