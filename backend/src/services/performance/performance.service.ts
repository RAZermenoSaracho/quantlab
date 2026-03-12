import { pool } from "../../config/db";
import { aggregatePerformanceMetrics } from "./aggregation.service";
import { computeRunMetricsFromDatabase } from "./metrics.service";
import { computePerformanceScore } from "./scoring.service";

export { computePerformanceScore } from "./scoring.service";
export type { AggregatedMetrics } from "./aggregation.service";

export async function recomputeAlgorithmPerformance(algorithmId: string) {
  const client = await pool.connect();

  try {
    const runSnapshot = await computeRunMetricsFromDatabase(client, algorithmId);
    const metrics = aggregatePerformanceMetrics(runSnapshot);
    const performanceScore = computePerformanceScore(metrics);

    if (process.env.PERFORMANCE_DEBUG === "1") {
      const returnsForSortino = (runSnapshot.backtests ?? []).map(
        (item) => Number(item.annualized_return_percent ?? 0)
      );
      const downsideReturns = returnsForSortino.filter((value) => value < 0);
      const downsideDeviation = downsideReturns.length
        ? Math.sqrt(
            downsideReturns.reduce((sum, value) => sum + value * value, 0) /
              downsideReturns.length
          )
        : 0.0001;
      // Temporary debugging aid for Sortino pipeline verification.
      console.log("[Performance][SortinoDebug]", {
        algorithmId,
        returnsForSortino,
        downsideReturns,
        downsideDeviation,
        computedSortino: metrics.sortino_ratio,
      });
    }

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
          calmar_ratio = $8,
          sortino_ratio = $9,
          return_stability = $10,
          confidence_score = $11,
          updated_at = NOW()
      WHERE id = $12
      `,
      [
        performanceScore,
        metrics.avg_return_percent,
        metrics.avg_sharpe,
        metrics.avg_pnl,
        metrics.win_rate,
        metrics.max_drawdown,
        metrics.runs_count,
        metrics.calmar_ratio,
        metrics.sortino_ratio,
        metrics.return_stability,
        metrics.confidence_score,
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
