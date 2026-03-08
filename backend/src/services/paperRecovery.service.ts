import { pool } from "../config/db";
import { startPaperOnEngine } from "./pythonEngine.service";
import type { MarketTimeframe } from "@quantlab/contracts";

const recoveredRunIds = new Set<string>();

type RunningPaperRunRow = {
  id: string;
  code: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  initial_balance: string | number;
  fee_rate: string | number | null;
};

function isAlreadyActiveEngineError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /already active|already running|already exists/i.test(error.message);
}

export function markRecoveredPaperRun(runId: string): void {
  recoveredRunIds.add(runId);
}

export function unmarkRecoveredPaperRun(runId: string): void {
  recoveredRunIds.delete(runId);
}

export function isRecoveredPaperRun(runId: string): boolean {
  return recoveredRunIds.has(runId);
}

export async function restoreRunningPaperRuns(): Promise<void> {
  const result = await pool.query<RunningPaperRunRow>(
    `
    SELECT
      p.id,
      a.code,
      p.exchange,
      p.symbol,
      p.timeframe,
      p.initial_balance,
      p.fee_rate
    FROM paper_runs p
    JOIN algorithms a ON a.id = p.algorithm_id
    WHERE LOWER(p.status::text) IN ('active', 'running')
    ORDER BY p.started_at ASC
    `
  );

  for (const run of result.rows) {
    if (isRecoveredPaperRun(run.id)) {
      continue;
    }

    try {
      await startPaperOnEngine({
        run_id: run.id,
        code: run.code,
        exchange: run.exchange ?? "binance",
        symbol: run.symbol,
        timeframe: run.timeframe as MarketTimeframe,
        initial_balance: Number(run.initial_balance ?? 0),
        fee_rate: Number(run.fee_rate ?? 0.001),
      });

      markRecoveredPaperRun(run.id);
      continue;
    } catch (error: unknown) {
      if (isAlreadyActiveEngineError(error)) {
        markRecoveredPaperRun(run.id);
        continue;
      }
      console.error(`[PaperRecovery] Failed to restore run ${run.id}:`, error);
    }
  }
}
