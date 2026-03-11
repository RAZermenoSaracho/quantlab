import { pool } from "../config/db";

type AggregatedMetrics = {
  avg_return_percent: number;
  avg_sharpe: number;
  avg_pnl: number;
  win_rate: number;
  max_drawdown: number;
  runs_count: number;
  total_trades: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toOptionalFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computePerformanceScore(metrics: AggregatedMetrics): number {
  const avgReturn = toOptionalFinite(metrics.avg_return_percent) ?? 0;
  const avgSharpeRaw = toOptionalFinite(metrics.avg_sharpe) ?? 0;
  const winRate = toOptionalFinite(metrics.win_rate) ?? 0;
  const maxDrawdown = toOptionalFinite(metrics.max_drawdown) ?? 0;
  const runsCount = Math.max(0, Math.trunc(toOptionalFinite(metrics.runs_count) ?? 0));
  const totalTrades = Math.max(0, Math.trunc(toOptionalFinite(metrics.total_trades) ?? 0));

  // Score balances profitability, risk-adjusted return, drawdown risk, and confidence by sample size.
  const sharpe = Math.min(avgSharpeRaw, 3);
  const returnComponent = avgReturn * 0.35;
  const sharpeComponent = sharpe * 25;
  const drawdownPenalty = maxDrawdown * 0.2;
  const winRateComponent = totalTrades >= 10 ? winRate * 0.15 : 0;

  const baseScore =
    returnComponent +
    sharpeComponent +
    winRateComponent -
    drawdownPenalty;

  let confidenceMultiplier = 1;
  if (runsCount < 3) {
    confidenceMultiplier = 0.5;
  } else if (runsCount < 10) {
    confidenceMultiplier = 0.8;
  }

  const adjustedScore = baseScore * confidenceMultiplier;
  return clamp(adjustedScore, 0, 100);
}

export async function recomputeAlgorithmPerformance(algorithmId: string) {
  const client = await pool.connect();

  try {
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

    const backtests = backtestsResult.rows ?? [];
    const paperRuns = paperRunsResult.rows ?? [];
    const backtestCount = backtests.length;
    const paperCount = paperRuns.length;
    const runs_count = backtestCount + paperCount;

    const average = (values: number[]) =>
      values.length > 0
        ? values.reduce((sum, current) => sum + current, 0) / values.length
        : 0;

    const annualizedReturnFromPercent = (
      totalReturnPercent: number,
      startDateRaw: Date | string | null,
      endDateRaw: Date | string | null
    ) => {
      const startMs = startDateRaw ? new Date(startDateRaw).getTime() : NaN;
      const endMs = endDateRaw ? new Date(endDateRaw).getTime() : NaN;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return null;
      }
      const days = (endMs - startMs) / 86_400_000;
      if (!Number.isFinite(days) || days <= 0) {
        return null;
      }
      const gross = 1 + totalReturnPercent / 100;
      if (!Number.isFinite(gross) || gross <= 0) {
        return null;
      }
      const annualized = (Math.pow(gross, 365 / days) - 1) * 100;
      return Number.isFinite(annualized) ? annualized : null;
    };

    const annualizedReturnFromPaper = (
      initialBalance: number,
      equity: number,
      startedAtRaw: Date | string | null,
      updatedAtRaw: Date | string | null
    ) => {
      if (initialBalance <= 0) {
        return null;
      }
      const growth = equity / initialBalance;
      if (!Number.isFinite(growth) || growth <= 0) {
        return null;
      }
      const startMs = startedAtRaw ? new Date(startedAtRaw).getTime() : NaN;
      const endMs = updatedAtRaw ? new Date(updatedAtRaw).getTime() : Date.now();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return null;
      }
      const days = (endMs - startMs) / 86_400_000;
      if (!Number.isFinite(days) || days <= 0) {
        return null;
      }
      const annualized = (Math.pow(growth, 365 / days) - 1) * 100;
      return Number.isFinite(annualized) ? annualized : null;
    };

    const backtestAnnualReturns = backtests
      .map((row) => {
        const totalReturnPercent = toOptionalFinite(row.total_return_percent);
        if (totalReturnPercent == null) {
          return null;
        }
        return annualizedReturnFromPercent(totalReturnPercent, row.start_date, row.end_date);
      })
      .filter((value): value is number => isFiniteNumber(value));

    const paperAnnualReturns = paperRuns
      .map((row) => {
        const initialBalance = toOptionalFinite(row.initial_balance);
        const equity = toOptionalFinite(row.equity);
        if (initialBalance == null || equity == null) {
          return null;
        }
        return annualizedReturnFromPaper(
          initialBalance,
          equity,
          row.started_at,
          row.updated_at
        );
      })
      .filter((value): value is number => isFiniteNumber(value));

    const allAnnualReturns = [...backtestAnnualReturns, ...paperAnnualReturns];

    const sharpes = backtests
      .map((row) => {
        const fromMetrics = toOptionalFinite(row.sharpe_ratio);
        if (fromMetrics != null) {
          return fromMetrics;
        }
        return toOptionalFinite(row.analysis_sharpe);
      })
      .filter((value): value is number => isFiniteNumber(value));

    const backtestPnls = backtests
      .map((row) => toOptionalFinite(row.total_return_usdt))
      .filter((value): value is number => isFiniteNumber(value));
    const paperPnls = paperRuns
      .map((row) => {
        const initialBalance = toOptionalFinite(row.initial_balance);
        const equity = toOptionalFinite(row.equity);
        if (initialBalance == null || equity == null) {
          return null;
        }
        return equity - initialBalance;
      })
      .filter((value): value is number => isFiniteNumber(value));

    const allPnls = [...backtestPnls, ...paperPnls];

    const backtestWinRates = backtests
      .map((row) => toOptionalFinite(row.win_rate_percent))
      .filter((value): value is number => isFiniteNumber(value));
    const paperWinRates = paperRuns
      .map((row) => toOptionalFinite(row.win_rate_percent))
      .filter((value): value is number => isFiniteNumber(value));
    const allWinRates = [...backtestWinRates, ...paperWinRates];

    const maxDrawdowns = backtests
      .map((row) => toOptionalFinite(row.max_drawdown_percent))
      .filter((value): value is number => isFiniteNumber(value));
    const totalTrades = Math.trunc(
      backtests.reduce((sum, row) => sum + (toOptionalFinite(row.total_trades) ?? 0), 0) +
      paperRuns.reduce((sum, row) => sum + (toOptionalFinite(row.total_trades) ?? 0), 0)
    );

    const metrics: AggregatedMetrics = {
      avg_return_percent: average(allAnnualReturns),
      avg_sharpe: average(sharpes), // Sharpe only from backtests
      avg_pnl: average(allPnls),
      win_rate: average(allWinRates),
      max_drawdown: average(maxDrawdowns),
      runs_count,
      total_trades: Math.max(0, totalTrades),
    };

    const performanceScore = computePerformanceScore(metrics);

    await client.query(
      `
      UPDATE algorithms
      SET performance_score = $1,
          avg_return_percent = $2,
          avg_sharpe = $3,
          avg_pnl = $4,
          win_rate = $5,
          max_drawdown = $6,
          runs_count = $7,
          updated_at = NOW()
      WHERE id = $8
      `,
      [
        performanceScore,
        metrics.avg_return_percent,
        metrics.avg_sharpe,
        metrics.avg_pnl,
        metrics.win_rate,
        metrics.max_drawdown,
        metrics.runs_count,
        algorithmId,
      ]
    );

    return {
      performance_score: performanceScore,
      ...metrics,
    };
  } finally {
    client.release();
  }
}
