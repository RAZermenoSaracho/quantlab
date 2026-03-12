import type { AggregatedMetrics } from "./aggregation.service";

function toFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computePerformanceScore(metrics: AggregatedMetrics): number {
  const sharpe = Math.min(toFinite(metrics.avg_sharpe), 3);
  const calmarRatio = toFinite(metrics.calmar_ratio);
  const avgReturnPercent = toFinite(metrics.avg_return_percent);
  const returnStability = toFinite(metrics.return_stability);
  const maxDrawdown = toFinite(metrics.max_drawdown);
  const confidenceScore = clamp(toFinite(metrics.confidence_score, 0), 0, 1);

  // Institutional-style score balancing profitability, risk-adjusted returns,
  // drawdown risk, stability of returns, and statistical confidence.
  const drawdownPenalty = maxDrawdown * 0.15;
  const rawScore =
    (sharpe * 20) +
    (calmarRatio * 20) +
    (avgReturnPercent * 0.25) +
    (returnStability * 15) -
    drawdownPenalty;

  const adjustedScore = rawScore * confidenceScore;
  return clamp(adjustedScore, 0, 100);
}
