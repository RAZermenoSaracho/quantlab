import type { PoolClient } from "pg";

export type RunMetric = {
  annualized_return_percent: number;
  sharpe: number | null;
  pnl: number;
  win_rate: number;
  max_drawdown: number;
  total_trades: number;
};

export type RunMetricsSnapshot = {
  backtests: RunMetric[];
  paperRuns: RunMetric[];
};

function toFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function annualizedFromPeriodReturn(
  totalReturnPercent: number,
  startDateRaw: Date | string | null,
  endDateRaw: Date | string | null
): number {
  const startMs = startDateRaw ? new Date(startDateRaw).getTime() : NaN;
  const endMs = endDateRaw ? new Date(endDateRaw).getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }

  const days = (endMs - startMs) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) {
    return 0;
  }

  const gross = 1 + totalReturnPercent / 100;
  if (!Number.isFinite(gross) || gross <= 0) {
    return 0;
  }

  const annualized = (Math.pow(gross, 365 / days) - 1) * 100;
  return Number.isFinite(annualized) ? annualized : 0;
}

function annualizedFromBalances(
  initialBalance: number,
  equity: number,
  startedAtRaw: Date | string | null,
  updatedAtRaw: Date | string | null
): number {
  if (!Number.isFinite(initialBalance) || initialBalance <= 0) {
    return 0;
  }

  const growth = equity / initialBalance;
  if (!Number.isFinite(growth) || growth <= 0) {
    return 0;
  }

  const startMs = startedAtRaw ? new Date(startedAtRaw).getTime() : NaN;
  const endMs = updatedAtRaw ? new Date(updatedAtRaw).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }

  const days = (endMs - startMs) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) {
    return 0;
  }

  const annualized = (Math.pow(growth, 365 / days) - 1) * 100;
  return Number.isFinite(annualized) ? annualized : 0;
}

export async function computeRunMetricsFromDatabase(
  client: PoolClient,
  algorithmId: string
): Promise<RunMetricsSnapshot> {
  const [backtestsResult, paperRunsResult] = await Promise.all([
    client.query<{
      total_return_percent: string | number | null;
      total_return_usdt: string | number | null;
      win_rate_percent: string | number | null;
      max_drawdown_percent: string | number | null;
      total_trades: string | number | null;
      sharpe_ratio: string | number | null;
      analysis_sharpe: string | number | null;
      start_date: Date | string | null;
      end_date: Date | string | null;
    }>(
      `
      SELECT
        m.total_return_percent,
        m.total_return_usdt,
        m.win_rate_percent,
        m.max_drawdown_percent,
        m.total_trades,
        m.sharpe_ratio,
        NULLIF(r.analysis #>> '{risk,sharpe}', '') AS analysis_sharpe,
        r.start_date,
        r.end_date
      FROM backtest_runs r
      LEFT JOIN metrics m
        ON m.run_id = r.id
       AND m.run_type = 'BACKTEST'
      WHERE r.algorithm_id = $1
      `,
      [algorithmId]
    ),
    client.query<{
      initial_balance: string | number | null;
      equity: string | number | null;
      started_at: Date | string | null;
      updated_at: Date | string | null;
      win_rate_percent: string | number | null;
      total_trades: string | number | null;
    }>(
      `
      SELECT
        pr.initial_balance,
        pr.equity,
        pr.started_at,
        pr.updated_at,
        pwr.win_rate_percent,
        pwr.total_trades
      FROM paper_runs pr
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
          END AS win_rate_percent,
          COUNT(*) FILTER (WHERE t.net_pnl IS NOT NULL)::int AS total_trades
        FROM trades t
        WHERE t.run_type = 'PAPER'
        GROUP BY t.run_id
      ) pwr ON pwr.run_id = pr.id
      WHERE pr.algorithm_id = $1
      `,
      [algorithmId]
    ),
  ]);

  const backtests: RunMetric[] = (backtestsResult.rows ?? []).map((row) => {
    const totalReturnPercent = toFinite(row.total_return_percent);
    const sharpeFromMetrics = Number(row.sharpe_ratio);
    const sharpeFromAnalysis = Number(row.analysis_sharpe);
    const sharpe = Number.isFinite(sharpeFromMetrics)
      ? sharpeFromMetrics
      : Number.isFinite(sharpeFromAnalysis)
        ? sharpeFromAnalysis
        : null;

    return {
      annualized_return_percent: annualizedFromPeriodReturn(
        totalReturnPercent,
        row.start_date,
        row.end_date
      ),
      sharpe,
      pnl: toFinite(row.total_return_usdt),
      win_rate: toFinite(row.win_rate_percent),
      max_drawdown: toFinite(row.max_drawdown_percent),
      total_trades: Math.max(0, Math.trunc(toFinite(row.total_trades))),
    };
  });

  const paperRuns: RunMetric[] = (paperRunsResult.rows ?? []).map((row) => {
    const initialBalance = toFinite(row.initial_balance);
    const equity = toFinite(row.equity);
    return {
      annualized_return_percent: annualizedFromBalances(
        initialBalance,
        equity,
        row.started_at,
        row.updated_at
      ),
      sharpe: null,
      pnl: equity - initialBalance,
      win_rate: toFinite(row.win_rate_percent),
      max_drawdown: 0,
      total_trades: Math.max(0, Math.trunc(toFinite(row.total_trades))),
    };
  });

  return { backtests, paperRuns };
}
