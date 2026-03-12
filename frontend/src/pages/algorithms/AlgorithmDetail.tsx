import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  AlgorithmPaperRun,
  AlgorithmBacktestRun,
} from "@quantlab/contracts";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import { StatusBadge } from "../../components/ui/StatusBadge";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import AlgorithmWorkspace from "../../components/algorithms/AlgorithmWorkspace";
import PerformanceScore from "../../components/algorithms/PerformanceScore";
import Button from "../../components/ui/Button";
import KpiCard from "../../components/ui/KpiCard";
import { formatDateTime } from "../../utils/date";
import {
  useAlgorithm,
  useAlgorithmRuns,
  useAlgorithms,
  useDeleteAlgorithmMutation,
  useRefreshAlgorithmMutation,
} from "../../data/algorithms";

type Tab = "overview" | "backtests" | "paper";
type MobileTab = "overview" | "code" | "backtests" | "paper";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function classifyMetric(
  name: string,
  value: number
): "good" | "neutral" | "bad" {
  const n = Number.isFinite(value) ? value : 0;
  switch (name) {
    case "sharpe":
      if (n >= 1) return "good";
      if (n >= 0.5) return "neutral";
      return "bad";
    case "sortino":
      if (n >= 1.5) return "good";
      if (n >= 1) return "neutral";
      return "bad";
    case "calmar":
      if (n >= 1) return "good";
      if (n >= 0.5) return "neutral";
      return "bad";
    case "avg_yearly_return":
      if (n >= 20) return "good";
      if (n >= 5) return "neutral";
      return "bad";
    case "win_rate":
      if (n >= 55) return "good";
      if (n >= 45) return "neutral";
      return "bad";
    case "max_drawdown":
      if (n <= 20) return "good";
      if (n <= 40) return "neutral";
      return "bad";
    case "return_stability":
      if (n >= 0.2) return "good";
      if (n >= 0.1) return "neutral";
      return "bad";
    case "confidence_score":
      if (n >= 0.7) return "good";
      if (n >= 0.4) return "neutral";
      return "bad";
    default:
      return "neutral";
  }
}

export default function AlgorithmDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [mobileTab, setMobileTab] = useState<MobileTab>("overview");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const {
    data: algorithm,
    loading: algorithmLoading,
    error: algorithmError,
  } = useAlgorithm(id ?? "");
  const {
    data: algorithms,
    loading: algorithmsLoading,
    error: algorithmsError,
  } = useAlgorithms();
  const {
    data: runs,
    loading: runsLoading,
    error: runsError,
  } = useAlgorithmRuns(id ?? "");
  const refreshMutation = useRefreshAlgorithmMutation(id ?? "");
  const deleteMutation = useDeleteAlgorithmMutation();

  const allIds = useMemo(() => algorithms ?? [], [algorithms]).map((item) => item.id);
  const backtests = useMemo(() => runs?.backtests ?? [], [runs]);
  const paperRuns = useMemo(() => runs?.paperRuns ?? [], [runs]);
  const averageBacktestMetrics = useMemo(() => {
    const annualizedFromBacktest = (item: AlgorithmBacktestRun): number => {
      const totalReturnPercent = Number(item.total_return_percent ?? 0);
      const startMs = item.start_date ? Date.parse(item.start_date) : NaN;
      const endMs = item.end_date ? Date.parse(item.end_date) : NaN;
      const durationMs = endMs - startMs;
      const days = durationMs > 0 ? durationMs / (1000 * 60 * 60 * 24) : NaN;
      const gross = 1 + (totalReturnPercent / 100);
      if (!Number.isFinite(days) || days <= 0 || gross <= 0) {
        return totalReturnPercent;
      }
      const annualized = (Math.pow(gross, 365 / days) - 1) * 100;
      return Number.isFinite(annualized) ? annualized : totalReturnPercent;
    };

    const count = backtests.length;
    if (count === 0) {
      return { avgReturn: 0, avgSharpe: 0, avgPnl: 0, count: 0 };
    }
    const sumReturn = backtests.reduce(
      (total, item) => total + annualizedFromBacktest(item),
      0
    );
    const sumSharpe = backtests.reduce(
      (total, item) => total + Number(item.sharpe_ratio ?? 0),
      0
    );
    const sumPnl = backtests.reduce(
      (total, item) => total + Number(item.total_return_usdt ?? 0),
      0
    );
    return {
      avgReturn: sumReturn / count,
      avgSharpe: sumSharpe / count,
      avgPnl: sumPnl / count,
      count,
    };
  }, [backtests]);
  const averagePaperMetrics = useMemo(() => {
    const count = paperRuns.length;
    if (count === 0) {
      return { avgPnl: 0, avgWinRate: 0, count: 0 };
    }
    const sumPnl = paperRuns.reduce(
      (total, item) => total + Number(item.pnl ?? 0),
      0
    );
    const sumWinRate = paperRuns.reduce(
      (total, item) => total + Number(item.win_rate_percent ?? 0),
      0
    );
    return {
      avgPnl: sumPnl / count,
      avgWinRate: sumWinRate / count,
      count,
    };
  }, [paperRuns]);

  useEffect(() => {
    if (!algorithm) {
      return;
    }
    setCode(algorithm.code ?? "");
  }, [algorithm]);

  const detailLoading = algorithmLoading || algorithmsLoading || runsLoading;
  const error = actionError || algorithmError || algorithmsError || runsError;

  if (detailLoading) {
    return (
      <div className="p-6 text-slate-400 animate-pulse">
        Loading algorithm...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-900/30 border border-red-700 text-red-400 rounded-xl">
        {error}
      </div>
    );
  }

  if (!algorithm) {
    return <div className="p-6 text-red-400">Algorithm not found.</div>;
  }

  const isGithub = Boolean(algorithm.github_url);
  const perfAvgYearlyReturn = Number(algorithm.avg_return_percent ?? 0);
  const perfAvgSharpe = Number(algorithm.avg_sharpe ?? 0);
  const perfAvgPnl = Number(algorithm.avg_pnl ?? 0);
  const perfWinRate = Number(algorithm.win_rate ?? 0);
  const perfMaxDrawdown = Number(algorithm.max_drawdown ?? 0);
  const perfCalmar = Number(algorithm.calmar_ratio ?? 0);
  const perfSortino = Number(algorithm.sortino_ratio ?? 0);
  const perfReturnStability = Number(algorithm.return_stability ?? 0);
  const perfConfidenceRaw = Number(algorithm.confidence_score ?? 0);

  async function handleRefresh() {
    if (!id) {
      return;
    }

    setSaving(true);
    setActionError(null);

    try {
      const updated = await refreshMutation.mutate(undefined);
      setCode(updated.code);
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, "Failed to refresh algorithm"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) {
      return;
    }

    await deleteMutation.mutate(id);

    const index = allIds.indexOf(id);
    const nextId =
      allIds[(index + 1) % allIds.length] ||
      allIds[(index - 1 + allIds.length) % allIds.length];

    if (nextId && allIds.length > 1) {
      navigate(`/algorithms/${nextId}`);
      return;
    }

    navigate("/algorithms");
  }

  const backtestColumns: ListColumn<AlgorithmBacktestRun>[] = [
    {
      key: "market",
      header: "Market",
      render: (bt) => (
        <div>
          <div className="text-white font-medium">{bt.symbol}</div>
          <div className="text-xs text-slate-500">
            {bt.timeframe}
            {bt.exchange ? ` • ${bt.exchange}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "return",
      header: "Return",
      render: (bt) => {
        const value = Number(bt.total_return_percent ?? 0);
        return (
          <span className={value >= 0 ? "text-emerald-400" : "text-red-400"}>
            {value.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (bt) => <StatusBadge status={bt.status} />,
    },
    {
      key: "created",
      header: "Created",
      render: (bt) => formatDateTime(bt.created_at),
    },
  ];

  const paperColumns: ListColumn<AlgorithmPaperRun>[] = [
    {
      key: "market",
      header: "Market",
      render: (run) => (
        <div>
          <div className="text-white font-medium">{run.symbol}</div>
          <div className="text-xs text-slate-500">
            {run.timeframe}
            {run.exchange ? ` • ${run.exchange}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      render: (run) => {
        const balance = Number(run.quote_balance ?? run.current_balance ?? 0);
        return <span className="text-slate-300">${balance.toFixed(2)}</span>;
      },
    },
    {
      key: "equity",
      header: "Total Equity",
      render: (run) => {
        const quote = Number(run.quote_balance ?? run.current_balance ?? 0);
        const base = Number(run.base_balance ?? 0);
        const last = Number(run.last_price ?? 0);
        const equity = Number(run.equity ?? quote + (base * last));
        return <span className="text-slate-300">${equity.toFixed(2)}</span>;
      },
    },
    {
      key: "pnl",
      header: "PnL",
      render: (run) => {
        const quote = Number(run.quote_balance ?? run.current_balance ?? 0);
        const base = Number(run.base_balance ?? 0);
        const last = Number(run.last_price ?? 0);
        const equity = Number(run.equity ?? quote + (base * last));
        const pnl = equity - Number(run.initial_balance ?? 0);
        const cls =
          pnl >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium";
        return <span className={cls}>{`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (run) => <StatusBadge status={run.status} />,
    },
    {
      key: "started",
      header: "Started",
      render: (run) => (run.started_at ? formatDateTime(run.started_at) : "—"),
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-8 lg:space-y-10">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between gap-4 lg:gap-8">
          <div>
            <h1 className="text-2xl lg:text-4xl font-bold text-white">{algorithm.name}</h1>
            <p className="text-xs text-slate-500 mt-3">
              Last updated: {formatDateTime(algorithm.updated_at)}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <DetailNavigator ids={allIds} currentId={id!} basePath="/algorithms" />

            {isGithub && (
              <Button
                variant="WARNING"
                size="md"
                loading={saving}
                loadingText="Refreshing..."
                onClick={handleRefresh}
              >
                Refresh
              </Button>
            )}

            <Button variant="PRIMARY" size="md" onClick={() => navigate(`/algorithms/${id}/edit`)}>
              Edit
            </Button>

            <Button variant="DELETE" size="md" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PerformanceScore score={Number(algorithm.performance_score ?? 0)} />
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">Strategy Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <KpiCard title="Avg Yearly Return" value={perfAvgYearlyReturn} size="compact" format={(value) => `${value.toFixed(2)}%`} variant={classifyMetric("avg_yearly_return", perfAvgYearlyReturn)} tooltip="20%+ good, 5-20% neutral, below 5% weak." />
            <KpiCard title="Avg Sharpe" value={perfAvgSharpe} size="compact" format={(value) => value.toFixed(2)} variant={classifyMetric("sharpe", perfAvgSharpe)} tooltip="Sharpe >= 1 is typically considered strong risk-adjusted performance." />
            <KpiCard title="Avg PnL" value={perfAvgPnl} size="compact" format={(value) => `$${value.toFixed(2)}`} />
            <KpiCard title="Win Rate" value={perfWinRate} size="compact" format={(value) => `${value.toFixed(2)}%`} variant={classifyMetric("win_rate", perfWinRate)} />
            <KpiCard title="Max Drawdown" value={perfMaxDrawdown} size="compact" format={(value) => `${value.toFixed(2)}%`} variant={classifyMetric("max_drawdown", perfMaxDrawdown)} />
            <KpiCard title="Calmar Ratio" value={perfCalmar} size="compact" format={(value) => value.toFixed(2)} variant={classifyMetric("calmar", perfCalmar)} />
            <KpiCard title="Sortino Ratio" value={perfSortino} size="compact" format={(value) => value.toFixed(2)} variant={classifyMetric("sortino", perfSortino)} />
            <KpiCard title="Return Stability" value={perfReturnStability} size="compact" format={(value) => value.toFixed(3)} variant={classifyMetric("return_stability", perfReturnStability)} />
            <KpiCard title="Confidence Score" value={perfConfidenceRaw * 100} size="compact" format={(value) => `${value.toFixed(1)}%`} variant={classifyMetric("confidence_score", perfConfidenceRaw)} />
            <KpiCard title="Runs Analyzed" value={Number(algorithm.runs_count ?? 0)} size="compact" />
          </div>
        </div>
      </div>

      <div className="lg:hidden flex gap-2 overflow-x-auto whitespace-nowrap border-b border-slate-800 p-2 text-sm">
        {(["overview", "code", "backtests", "paper"] as MobileTab[]).map((tab) => (
          <Button
            key={tab}
            className="flex-shrink-0"
            variant={mobileTab === tab ? "PRIMARY" : "GHOST"}
            size="sm"
            onClick={() => setMobileTab(tab)}
          >
            {tab === "overview" && "Overview"}
            {tab === "code" && "Code"}
            {tab === "backtests" && `Backtests (${backtests.length})`}
            {tab === "paper" && `Paper Runs (${paperRuns.length})`}
          </Button>
        ))}
      </div>

      <div className="hidden lg:flex flex-wrap gap-2 sm:gap-4 border-b border-slate-800 text-sm">
        {(["overview", "backtests", "paper"] as Tab[]).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "PRIMARY" : "GHOST"}
            size="sm"
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview" && "Overview"}
            {tab === "backtests" && `Backtests (${backtests.length})`}
            {tab === "paper" && `Paper Runs (${paperRuns.length})`}
          </Button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="hidden lg:block space-y-10">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            <h2 className="text-lg font-semibold text-white mb-4">Strategy Notes</h2>
            <div
              className="prose prose-invert max-w-none text-slate-300"
              dangerouslySetInnerHTML={{
                __html: algorithm.notes_html || "",
              }}
            />
          </div>

          <AlgorithmWorkspace
            code={code}
            onChange={setCode}
            disabled={true}
            isGithub={isGithub}
          />
        </div>
      )}

      {activeTab === "backtests" && (
        <div className="hidden lg:block">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">Average Backtest Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard title="Avg Annualized Return" value={averageBacktestMetrics.avgReturn} size="compact" format={(value) => `${value.toFixed(2)}%`} />
              <KpiCard title="Avg Sharpe" value={averageBacktestMetrics.avgSharpe} size="compact" format={(value) => value.toFixed(2)} />
              <KpiCard title="Avg PnL" value={averageBacktestMetrics.avgPnl} size="compact" format={(value) => `$${value.toFixed(2)}`} />
              <KpiCard title="Backtests Analyzed" value={averageBacktestMetrics.count} size="compact" />
            </div>
          </div>
          <ListView
            title="Backtests"
            description="Historical runs for this strategy."
            columns={backtestColumns}
            data={backtests}
            loading={false}
            emptyMessage="No backtests yet."
            onRowClick={(bt) => navigate(`/backtests/${bt.id}`)}
          />
        </div>
      )}

      {activeTab === "paper" && (
        <div className="hidden lg:block">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
            <h3 className="text-white font-semibold mb-4">Average Live Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <KpiCard title="Avg PnL" value={averagePaperMetrics.avgPnl} size="compact" format={(value) => `$${value.toFixed(2)}`} />
              <KpiCard title="Win Rate" value={averagePaperMetrics.avgWinRate} size="compact" format={(value) => `${value.toFixed(2)}%`} />
              <KpiCard title="Runs Analyzed" value={averagePaperMetrics.count} size="compact" />
            </div>
          </div>
          <ListView
            title="Paper Runs"
            description="Live and past simulated trading sessions."
            columns={paperColumns}
            data={paperRuns}
            emptyMessage="No paper runs yet."
            onRowClick={(run) => navigate(`/paper/${run.id}`)}
          />
        </div>
      )}

      {mobileTab === "overview" && (
        <div className="lg:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Strategy Notes</h2>
            <div
              className="prose prose-invert max-w-none text-slate-300"
              dangerouslySetInnerHTML={{
                __html: algorithm.notes_html || "",
              }}
            />
          </div>
        </div>
      )}

      {mobileTab === "code" && (
        <div className="lg:hidden">
          <AlgorithmWorkspace
            code={code}
            onChange={setCode}
            disabled={true}
            isGithub={isGithub}
            initialDocsOpen={false}
          />
        </div>
      )}

      {mobileTab === "backtests" && (
        <div className="lg:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
            <h3 className="text-white font-semibold mb-3">Average Backtest Metrics</h3>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard title="Avg Annualized Return" value={averageBacktestMetrics.avgReturn} size="compact" format={(value) => `${value.toFixed(2)}%`} />
              <KpiCard title="Avg Sharpe" value={averageBacktestMetrics.avgSharpe} size="compact" format={(value) => value.toFixed(2)} />
              <KpiCard title="Avg PnL" value={averageBacktestMetrics.avgPnl} size="compact" format={(value) => `$${value.toFixed(2)}`} />
              <KpiCard title="Backtests Analyzed" value={averageBacktestMetrics.count} size="compact" />
            </div>
          </div>
          <ListView
            title="Backtests"
            description="Historical runs for this strategy."
            columns={backtestColumns}
            data={backtests}
            loading={false}
            emptyMessage="No backtests yet."
            onRowClick={(bt) => navigate(`/backtests/${bt.id}`)}
          />
        </div>
      )}

      {mobileTab === "paper" && (
        <div className="lg:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-4">
            <h3 className="text-white font-semibold mb-3">Average Live Metrics</h3>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard title="Avg PnL" value={averagePaperMetrics.avgPnl} size="compact" format={(value) => `$${value.toFixed(2)}`} />
              <KpiCard title="Win Rate" value={averagePaperMetrics.avgWinRate} size="compact" format={(value) => `${value.toFixed(2)}%`} />
              <KpiCard title="Runs Analyzed" value={averagePaperMetrics.count} size="compact" />
            </div>
          </div>
          <ListView
            title="Paper Runs"
            description="Live and past simulated trading sessions."
            columns={paperColumns}
            data={paperRuns}
            emptyMessage="No paper runs yet."
            onRowClick={(run) => navigate(`/paper/${run.id}`)}
          />
        </div>
      )}
    </div>
  );
}
