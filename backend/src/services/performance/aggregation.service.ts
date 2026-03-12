import type { RunMetricsSnapshot } from "./metrics.service";

export type AggregatedMetrics = {
  avg_return_percent: number;
  avg_sharpe: number;
  avg_pnl: number;
  win_rate: number;
  max_drawdown: number;
  runs_count: number;
  total_trades: number;
  calmar_ratio: number;
  sortino_ratio: number;
  profit_factor: number;
  return_stability: number;
  confidence_score: number;
};

function toFinite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    values.length;
  const out = Math.sqrt(variance);
  return Number.isFinite(out) ? out : 0;
}

export function aggregatePerformanceMetrics(
  snapshot: RunMetricsSnapshot
): AggregatedMetrics {
  const backtests = snapshot.backtests ?? [];
  const paperRuns = snapshot.paperRuns ?? [];
  const allRuns = [...backtests, ...paperRuns];

  const annualizedReturns = allRuns.map((item) =>
    toFinite(item.annualized_return_percent)
  );
  const backtestAnnualizedReturns = backtests.map((item) =>
    toFinite(item.annualized_return_percent)
  );
  const sharpes = backtests
    .map((item) => item.sharpe)
    .filter((value): value is number => Number.isFinite(value));
  const pnls = allRuns.map((item) => toFinite(item.pnl));
  const winRates = allRuns.map((item) => toFinite(item.win_rate));
  const maxDrawdowns = backtests.map((item) => toFinite(item.max_drawdown));

  const runs_count = allRuns.length;
  const total_trades = Math.max(
    0,
    Math.trunc(allRuns.reduce((sum, item) => sum + toFinite(item.total_trades), 0))
  );

  const avg_return_percent = average(annualizedReturns);
  const avg_sharpe = average(sharpes);
  const avg_pnl = average(pnls);
  const win_rate = average(winRates);
  const max_drawdown = average(maxDrawdowns);

  const calmar_ratio =
    max_drawdown > 0 ? avg_return_percent / max_drawdown : 0;

  // Sortino uses the same return universe as Sharpe (backtests).
  // If there is no downside volatility, use Sharpe as the practical proxy.
  const downsideReturns = backtestAnnualizedReturns.filter((value) => value < 0);
  const downsideDeviation = downsideReturns.length > 0
    ? Math.sqrt(
        downsideReturns.reduce((sum, value) => sum + value * value, 0) /
          downsideReturns.length
      )
    : 0;
  const rawSortino =
    downsideDeviation > 0 ? avg_return_percent / downsideDeviation : avg_sharpe;
  const sortino_ratio = Number.isFinite(rawSortino)
    ? Math.min(rawSortino, 10)
    : avg_sharpe;

  const grossProfit = pnls
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(
    pnls.filter((value) => value < 0).reduce((sum, value) => sum + value, 0)
  );
  const profit_factor = grossLoss > 0 ? grossProfit / grossLoss : 0;

  const returnsVolatility = stdDev(annualizedReturns);
  const return_stability = 1 / (1 + returnsVolatility);

  let confidence_score = Math.min(1, runs_count / 10);
  if (total_trades < 50) {
    confidence_score *= 0.7;
  }

  return {
    avg_return_percent,
    avg_sharpe,
    avg_pnl,
    win_rate,
    max_drawdown,
    runs_count,
    total_trades,
    calmar_ratio,
    sortino_ratio,
    profit_factor,
    return_stability,
    confidence_score,
  };
}
