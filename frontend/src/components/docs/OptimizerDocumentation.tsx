export default function OptimizerDocumentation() {
  return (
    <div className="space-y-4 text-sm text-slate-300">
      <p>
        The Auto-Optimizer runs a bounded grid search over selected strategy
        parameters from <code>CONFIG["params"]</code>. Each combination is
        backtested on the same market, timeframe, and lookback period so the
        results are directly comparable.
      </p>
      <p>
        Parameter ranges are generated from the shared strategy parameter
        registry. The registry provides the default minimum, maximum, step, and
        description for each supported parameter, and you can edit those values
        before starting an optimizer run.
      </p>
      <p>
        Every optimizer run includes a baseline result for the strategy&apos;s
        current parameter values. That baseline appears in the ranking as
        <span className="font-medium text-white"> Current Strategy</span>, so
        you can tell whether any tested combinations actually outperform the
        existing configuration.
      </p>
      <p>
        Results are ranked primarily by Sharpe ratio, with total return used as
        a secondary tie-breaker. Applying a result never happens automatically:
        you review the ranking first, then explicitly apply the parameter set
        you want to persist into the algorithm code.
      </p>
    </div>
  );
}
