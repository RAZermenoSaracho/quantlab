import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  AlgorithmBacktestRun,
  AlgorithmPaperRun,
  OptimizerRanking,
  OptimizerRunResult,
} from "@quantlab/contracts";
import DetailNavigator from "../../components/navigation/DetailNavigator";
import { useAuth } from "../../context/AuthProvider";
import { StatusBadge } from "../../components/ui/StatusBadge";
import ListView, { type ListColumn } from "../../components/ui/ListView";
import AlgorithmWorkspace from "../../components/algorithms/AlgorithmWorkspace";
import PerformanceScore from "../../components/algorithms/PerformanceScore";
import Button from "../../components/ui/Button";
import KpiCard from "../../components/ui/KpiCard";
import { formatDateTime } from "../../utils/date";
import {
  useAlgorithm,
  useAlgorithms,
  useAlgorithmRuns,
  useDeleteAlgorithmMutation,
  useRefreshAlgorithmMutation,
  useRunOptimizerMutation,
  useUpdateAlgorithmMutation,
} from "../../data/algorithms";
import { useExchanges, useSymbols } from "../../data/market";

type Tab = "overview" | "backtests" | "paper" | "optimizer";
type MobileTab = "overview" | "code" | "backtests" | "paper" | "optimizer";
type OptimizerParamRow = {
  id: string;
  name: string;
  min: string;
  max: string;
  step: string;
};
type DetectedOptimizerParam = {
  name: string;
  value: number | string | boolean | null;
};

function createOptimizerParamRow(): OptimizerParamRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    min: "",
    max: "",
    step: "",
  };
}

function formatOptimizerNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number(value.toFixed(6)).toString();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function countDecimals(value: string): number {
  const normalized = value.trim();
  if (!normalized.includes(".")) {
    return 0;
  }

  return normalized.split(".")[1]?.length ?? 0;
}

function buildRangeValues(minRaw: string, maxRaw: string, stepRaw: string): number[] {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  const step = Number(stepRaw);

  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) {
    throw new Error("Optimizer ranges require numeric min, max, and step values.");
  }

  if (step <= 0) {
    throw new Error("Optimizer step must be greater than 0.");
  }

  if (max < min) {
    throw new Error("Optimizer max must be greater than or equal to min.");
  }

  const precision = Math.max(
    countDecimals(minRaw),
    countDecimals(maxRaw),
    countDecimals(stepRaw)
  );
  const epsilon = step / 1_000_000;
  const values: number[] = [];

  for (let index = 0; index < 1000; index += 1) {
    const current = min + step * index;
    if (current > max + epsilon) {
      break;
    }
    values.push(Number(current.toFixed(precision)));
  }

  if (values.length === 0) {
    values.push(Number(min.toFixed(precision)));
  }

  return values;
}

function parseParamLiteral(raw: string): number | string | boolean | null {
  const trimmed = raw.trim().replace(/,+$/, "");

  if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed === "True") return true;
  if (trimmed === "False") return false;
  if (trimmed === "None" || trimmed === "null") return null;

  const quoted = trimmed.match(/^["']([\s\S]*)["']$/);
  if (quoted) {
    return quoted[1];
  }

  return trimmed;
}

function extractOptimizerParamsFromCode(code: string): DetectedOptimizerParam[] {
  if (!code.trim()) {
    return [];
  }

  const paramsMatch = code.match(/["']params["']\s*:\s*\{([\s\S]*?)\n?\s*\}/m);
  if (!paramsMatch) {
    return [];
  }

  const body = paramsMatch[1];
  const matches = body.matchAll(/["']([^"']+)["']\s*:\s*([^,\n}]+)/g);
  const detected: DetectedOptimizerParam[] = [];

  for (const match of matches) {
    const name = match[1]?.trim();
    const rawValue = match[2]?.trim();

    if (!name || !rawValue) {
      continue;
    }

    detected.push({
      name,
      value: parseParamLiteral(rawValue),
    });
  }

  return detected;
}

function roundToStep(value: number, step: number, direction: "up" | "down"): number {
  const ratio = value / step;
  const rounded =
    direction === "up" ? Math.ceil(ratio + 1e-9) : Math.floor(ratio - 1e-9);
  return rounded * step;
}

function suggestOptimizerRange(
  name: string,
  value: number | string | boolean | null
): Pick<OptimizerParamRow, "min" | "max" | "step"> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { min: "", max: "", step: "" };
  }

  const normalizedName = name.toLowerCase();
  const absValue = Math.abs(value);

  if (normalizedName.includes("pct") || normalizedName.includes("percent")) {
    const step = absValue >= 50 ? 5 : absValue >= 10 ? 2 : 1;
    const min = Math.max(0, roundToStep(value - 25, step, "down"));
    const max = Math.min(100, roundToStep(value + 5, step, "up"));
    return {
      min: formatOptimizerNumber(min),
      max: formatOptimizerNumber(max),
      step: formatOptimizerNumber(step),
    };
  }

  if (normalizedName.includes("bps")) {
    const step = Math.max(1, roundToStep(Math.max(absValue * 0.25, 1), 1, "up"));
    const min = roundToStep(Math.max(0, value - step * 3), step, "down");
    const max = roundToStep(value + step * 6, step, "up");
    return {
      min: formatOptimizerNumber(min),
      max: formatOptimizerNumber(max),
      step: formatOptimizerNumber(step),
    };
  }

  if (absValue < 1) {
    const span = Math.max(absValue * 0.5, 0.01);
    const step = span <= 0.01 ? 0.002 : 0.005;
    return {
      min: formatOptimizerNumber(value - span),
      max: formatOptimizerNumber(value + span),
      step: formatOptimizerNumber(step),
    };
  }

  if (absValue <= 10) {
    const step = absValue >= 2 ? 0.25 : 0.2;
    const span = Math.max(1, roundToStep(absValue * 0.4, step, "up"));
    return {
      min: formatOptimizerNumber(roundToStep(value - span, step, "down")),
      max: formatOptimizerNumber(roundToStep(value + span, step, "up")),
      step: formatOptimizerNumber(step),
    };
  }

  const step = Math.max(1, roundToStep(absValue * 0.1, 1, "up"));
  const span = Math.max(step * 3, roundToStep(absValue * 0.5, step, "up"));
  return {
    min: formatOptimizerNumber(roundToStep(value - span, step, "down")),
    max: formatOptimizerNumber(roundToStep(value + span, step, "up")),
    step: formatOptimizerNumber(step),
  };
}

function createOptimizerRowsFromDetectedParams(
  detectedParams: DetectedOptimizerParam[]
): OptimizerParamRow[] {
  return detectedParams.map((param) => ({
    id: `${param.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: param.name,
    ...suggestOptimizerRange(param.name, param.value),
  }));
}

function areOptimizerRowsEmpty(rows: OptimizerParamRow[]): boolean {
  return rows.every(
    (row) =>
      !row.name.trim() &&
      !row.min.trim() &&
      !row.max.trim() &&
      !row.step.trim()
  );
}

function formatPythonLiteral(value: string | number | boolean | null): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (value === null) {
    return "None";
  }
  return String(value);
}

function applyOptimizedParamsToCode(
  sourceCode: string,
  params: Record<string, string | number | boolean | null>
): string {
  const paramsBlockMatch = sourceCode.match(/(["']params["']\s*:\s*\{)([\s\S]*?)(\n?\s*\})/m);
  if (!paramsBlockMatch) {
    return sourceCode;
  }

  let updatedParamsBlock = paramsBlockMatch[2];
  for (const [name, value] of Object.entries(params)) {
    const keyPattern = new RegExp(
      `((["'])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\2\\s*:\\s*)([^,\\n}]+)`,
      "g"
    );
    updatedParamsBlock = updatedParamsBlock.replace(
      keyPattern,
      `$1${formatPythonLiteral(value)}`
    );
  }

  return sourceCode.replace(
    paramsBlockMatch[0],
    `${paramsBlockMatch[1]}${updatedParamsBlock}${paramsBlockMatch[3]}`
  );
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
  const { user, isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [mobileTab, setMobileTab] = useState<MobileTab>("overview");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [optimizerRows, setOptimizerRows] = useState<OptimizerParamRow[]>([
    createOptimizerParamRow(),
  ]);
  const [optimizerExchange, setOptimizerExchange] = useState<string>("binance");
  const [optimizerSymbol, setOptimizerSymbol] = useState<string>("");
  const [optimizerSymbolQuery, setOptimizerSymbolQuery] = useState("");
  const [debouncedOptimizerSymbolQuery, setDebouncedOptimizerSymbolQuery] = useState("");
  const [optimizerResult, setOptimizerResult] = useState<OptimizerRanking | null>(null);
  const [optimizerError, setOptimizerError] = useState<string | null>(null);
  const [applyingRank, setApplyingRank] = useState<number | null>(null);

  const {
    data: algorithm,
    loading: algorithmLoading,
    error: algorithmError,
  } = useAlgorithm(id ?? "");
  const { data: algorithms } = useAlgorithms();
  const { data: exchangesData } = useExchanges();
  const { data: optimizerSymbolsData } = useSymbols(
    optimizerExchange,
    debouncedOptimizerSymbolQuery
  );
  const {
    data: runs,
    loading: runsLoading,
    error: runsError,
  } = useAlgorithmRuns(id ?? "");
  const refreshMutation = useRefreshAlgorithmMutation(id ?? "");
  const deleteMutation = useDeleteAlgorithmMutation();
  const optimizerMutation = useRunOptimizerMutation();
  const updateMutation = useUpdateAlgorithmMutation(id ?? "");

  const backtests = useMemo(() => runs?.backtests ?? [], [runs]);
  const paperRuns = useMemo(() => runs?.paperRuns ?? [], [runs]);
  const allAlgorithmIds = useMemo(
    () => (algorithms ?? []).map((item) => item.id),
    [algorithms]
  );
  const exchanges = useMemo(() => exchangesData ?? [], [exchangesData]);
  const optimizerSymbols = useMemo(
    () => optimizerSymbolsData ?? [],
    [optimizerSymbolsData]
  );
  const isOwner = Boolean(algorithm && user && algorithm.user_id === user.id);
  const canOpenRunDetails = isAuthenticated && isOwner;
  const detectedOptimizerParams = useMemo(
    () => extractOptimizerParamsFromCode(algorithm?.code ?? ""),
    [algorithm?.code]
  );

  const averageBacktestMetrics = useMemo(() => {
    const annualizedFromBacktest = (item: AlgorithmBacktestRun): number => {
      const totalReturnPercent = Number(item.total_return_percent ?? 0);
      const startMs = item.start_date ? Date.parse(item.start_date) : NaN;
      const endMs = item.end_date ? Date.parse(item.end_date) : NaN;
      const durationMs = endMs - startMs;
      const days = durationMs > 0 ? durationMs / (1000 * 60 * 60 * 24) : NaN;
      const gross = 1 + totalReturnPercent / 100;
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

  useEffect(() => {
    if (!detectedOptimizerParams.length) {
      return;
    }

    setOptimizerRows((current) => {
      if (!areOptimizerRowsEmpty(current)) {
        return current;
      }

      const nextRows = createOptimizerRowsFromDetectedParams(detectedOptimizerParams);
      return nextRows.length > 0 ? nextRows : current;
    });
  }, [detectedOptimizerParams]);

  useEffect(() => {
    if (!optimizerSymbolQuery) {
      setDebouncedOptimizerSymbolQuery("");
      return;
    }

    const timeout = window.setTimeout(() => {
      setDebouncedOptimizerSymbolQuery(optimizerSymbolQuery);
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [optimizerSymbolQuery]);

  useEffect(() => {
    if (!exchanges.length) {
      return;
    }

    if (!exchanges.some((exchange) => exchange.id === optimizerExchange)) {
      setOptimizerExchange(exchanges[0].id);
    }
  }, [exchanges, optimizerExchange]);

  const detailLoading = algorithmLoading || runsLoading;
  const error = actionError || algorithmError || runsError;

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
    if (!id || !isOwner) {
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
    if (!id || !isOwner) {
      return;
    }

    await deleteMutation.mutate(id);
    navigate("/algorithms");
  }

  function updateOptimizerRow(
    rowId: string,
    field: keyof Omit<OptimizerParamRow, "id">,
    value: string
  ) {
    setOptimizerRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      )
    );
  }

  function addOptimizerRow() {
    setOptimizerRows((current) => [...current, createOptimizerParamRow()]);
  }

  function removeOptimizerRow(rowId: string) {
    setOptimizerRows((current) =>
      current.length === 1
        ? [createOptimizerParamRow()]
        : current.filter((row) => row.id !== rowId)
    );
  }

  async function handleRunOptimizer() {
    if (!id || !isOwner) {
      return;
    }

    setOptimizerError(null);

    try {
      if (!optimizerSymbol.trim()) {
        throw new Error("Please select a market symbol.");
      }

      const filledRows = optimizerRows.filter((row) =>
        [row.name, row.min, row.max, row.step].some((value) => value.trim() !== "")
      );

      if (filledRows.length === 0) {
        throw new Error("Add at least one parameter range before running the optimizer.");
      }

      const paramSpace = filledRows.reduce<Record<string, number[]>>((acc, row) => {
        if (!row.name.trim() || !row.min.trim() || !row.max.trim() || !row.step.trim()) {
          throw new Error("Each optimizer row must include parameter name, min, max, and step.");
        }

        acc[row.name.trim()] = buildRangeValues(row.min, row.max, row.step);
        return acc;
      }, {});

      const ranking = await optimizerMutation.mutate({
        algorithmId: id,
        exchange: optimizerExchange,
        symbol: optimizerSymbol,
        paramSpace,
      });
      setOptimizerResult(ranking);
    } catch (err: unknown) {
      setOptimizerError(getErrorMessage(err, "Failed to run optimizer"));
    }
  }

  async function handleApplyOptimizedParams(result: OptimizerRunResult) {
    if (!id || !isOwner) {
      return;
    }

    setOptimizerError(null);
    setApplyingRank(result.rank);

    try {
      const updatedCode = applyOptimizedParamsToCode(code, result.params);
      const updatedAlgorithm = await updateMutation.mutate({
        code: updatedCode,
      });
      setCode(updatedAlgorithm.code ?? updatedCode);
    } catch (err: unknown) {
      setOptimizerError(
        getErrorMessage(err, "Failed to apply optimized parameters")
      );
    } finally {
      setApplyingRank(null);
    }
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
        const equity = Number(run.equity ?? quote + base * last);
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
        const equity = Number(run.equity ?? quote + base * last);
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

  const optimizerColumns: ListColumn<OptimizerRunResult>[] = [
    {
      key: "rank",
      header: "Rank",
      render: (result) => (
        <span className="font-semibold text-white">#{result.rank}</span>
      ),
    },
    {
      key: "return",
      header: "Return",
      render: (result) => {
        const value = Number(result.metrics.total_return_percent ?? 0);
        return (
          <span className={value >= 0 ? "text-emerald-400" : "text-red-400"}>
            {value.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: "sharpe",
      header: "Sharpe",
      render: (result) => (
        <span className="text-slate-300">
          {Number(result.metrics.sharpe_ratio ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "drawdown",
      header: "Drawdown",
      render: (result) => (
        <span className="text-slate-300">
          {Number(result.metrics.max_drawdown_percent ?? 0).toFixed(2)}%
        </span>
      ),
    },
    {
      key: "params",
      header: "Parameters",
      render: (result) => (
        <div className="max-w-[420px] whitespace-normal break-words text-slate-300">
          {Object.entries(result.params)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(", ")}
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (result) => (
        <Button
          variant="OUTLINE"
          size="sm"
          loading={applyingRank === result.rank}
          loadingText="Applying..."
          onClick={() => handleApplyOptimizedParams(result)}
        >
          Apply
        </Button>
      ),
    },
  ];

  function renderOptimizerSection() {
    if (!isOwner) {
      return null;
    }

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-white font-semibold">Auto-Optimizer</h3>
            <p className="text-sm text-slate-400">
              Runs a grid search over `CONFIG["params"]` on the selected market using a fixed 1h timeframe and the last 1 year of data.
            </p>
          </div>
          <Button
            variant="SUCCESS"
            size="md"
            loading={optimizerMutation.loading}
            loadingText="Optimizing..."
            onClick={handleRunOptimizer}
          >
            Run Optimizer
          </Button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Exchange
              </span>
              <select
                value={optimizerExchange}
                onChange={(event) => {
                  setOptimizerExchange(event.target.value);
                  setOptimizerSymbol("");
                  setOptimizerSymbolQuery("");
                  setDebouncedOptimizerSymbolQuery("");
                }}
                className="form-input"
              >
                {exchanges.map((exchange) => (
                  <option key={exchange.id} value={exchange.id}>
                    {exchange.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Market Symbol
              </span>
              <div>
                <input
                  value={optimizerSymbolQuery}
                  onChange={(event) =>
                    setOptimizerSymbolQuery(event.target.value.toUpperCase())
                  }
                  placeholder="Search symbol (BTC, ETH...)"
                  className="form-input"
                />

                {optimizerSymbols.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-700 bg-slate-900">
                    {optimizerSymbols.map((symbol) => (
                      <div
                        key={symbol.symbol}
                        onClick={() => {
                          setOptimizerSymbol(symbol.symbol);
                          setOptimizerSymbolQuery(symbol.symbol);
                        }}
                        className="cursor-pointer px-4 py-2 text-white hover:bg-slate-800"
                      >
                        {symbol.symbol}
                      </div>
                    ))}
                  </div>
                )}

                {optimizerSymbol && (
                  <p className="mt-2 text-xs text-slate-400">
                    Selected: <span className="text-sky-400">{optimizerSymbol}</span>
                  </p>
                )}
              </div>
            </label>
          </div>

          {detectedOptimizerParams.length > 0 && (
            <p className="text-xs text-slate-500">
              Detected parameters from `CONFIG["params"]`. Suggested ranges are editable before you run the optimizer.
            </p>
          )}

          {optimizerRows.map((row) => (
            <div key={row.id} className="grid grid-cols-1 gap-3 md:grid-cols-[1.6fr_repeat(3,minmax(0,1fr))_auto]">
              <input
                value={row.name}
                onChange={(event) => updateOptimizerRow(row.id, "name", event.target.value)}
                placeholder="parameter name"
                readOnly={Boolean(detectedOptimizerParams.length)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none read-only:cursor-default read-only:opacity-80"
              />
              <input
                value={row.min}
                onChange={(event) => updateOptimizerRow(row.id, "min", event.target.value)}
                placeholder="min"
                inputMode="decimal"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <input
                value={row.max}
                onChange={(event) => updateOptimizerRow(row.id, "max", event.target.value)}
                placeholder="max"
                inputMode="decimal"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <input
                value={row.step}
                onChange={(event) => updateOptimizerRow(row.id, "step", event.target.value)}
                placeholder="step"
                inputMode="decimal"
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <Button
                variant="GHOST"
                size="sm"
                className="justify-center"
                onClick={() => removeOptimizerRow(row.id)}
              >
                Remove
              </Button>
            </div>
          ))}

          {!detectedOptimizerParams.length && (
            <Button variant="OUTLINE" size="sm" onClick={addOptimizerRow}>
              Add Parameter
            </Button>
          )}
        </div>

        {optimizerError && (
          <div className="rounded-xl border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
            {optimizerError}
          </div>
        )}

        {optimizerResult && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
              {optimizerResult.baseline && (
                <div>
                  Baseline: {optimizerResult.baseline.symbol} {optimizerResult.baseline.timeframe} on {optimizerResult.baseline.exchange} from{" "}
                  {formatDateTime(optimizerResult.baseline.start_date)} to {formatDateTime(optimizerResult.baseline.end_date)}
                </div>
              )}
              <div>
                Evaluated {optimizerResult.combinations_evaluated} of {optimizerResult.combinations_generated} combinations.
                {optimizerResult.truncated ? " Results were truncated at the 20-combination safety limit." : ""}
              </div>
            </div>

            <ListView
              title="Optimizer Results"
              description="Ranked by Sharpe ratio."
              columns={optimizerColumns}
              data={optimizerResult.results}
              emptyMessage="No optimizer results yet."
              tableId="algorithm-optimizer-results"
            />
          </div>
        )}
      </div>
    );
  }

  const codeLabel =
    algorithm.code === "[Private Algorithm]" ? "Private Source" : "Strategy Code";

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-8 lg:space-y-10">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between gap-4 lg:gap-8">
          <div className="space-y-3">
            <h1 className="text-2xl lg:text-4xl font-bold text-white">{algorithm.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <span>
                Creator:{" "}
                {algorithm.username ? (
                  <Link
                    to={`/profile/${algorithm.username}`}
                    className="text-sky-400 hover:text-sky-300"
                  >
                    @{algorithm.username}
                  </Link>
                ) : (
                  "Unknown"
                )}
              </span>
              <span>{algorithm.is_public ? "Open Source" : "Private Source"}</span>
            </div>
            <p className="text-xs text-slate-500">
              Last updated: {formatDateTime(algorithm.updated_at)}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <DetailNavigator
              ids={allAlgorithmIds}
              currentId={algorithm.id}
              basePath="/algorithms"
            />
            {isOwner && (
              <>
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

              <Button
                variant="PRIMARY"
                size="md"
                onClick={() => navigate(`/algorithms/${id}/edit`)}
              >
                Edit
              </Button>

              <Button variant="DELETE" size="md" onClick={handleDelete}>
                Delete
              </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PerformanceScore score={Number(algorithm.performance_score ?? 0)} />
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">Strategy Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <KpiCard title="Avg Yearly Return" value={perfAvgYearlyReturn} size="compact" format={(value) => `${value.toFixed(2)}%`} variant={classifyMetric("avg_yearly_return", perfAvgYearlyReturn)} />
            <KpiCard title="Avg Sharpe" value={perfAvgSharpe} size="compact" format={(value) => value.toFixed(2)} variant={classifyMetric("sharpe", perfAvgSharpe)} />
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
        {(["overview", "code", "backtests", "optimizer", "paper"] as MobileTab[]).map((tab) => (
          <Button
            key={tab}
            className="flex-shrink-0"
            variant={mobileTab === tab ? "PRIMARY" : "GHOST"}
            size="sm"
            onClick={() => setMobileTab(tab)}
          >
            {tab === "overview" && "Overview"}
            {tab === "code" && codeLabel}
            {tab === "backtests" && `Backtests (${backtests.length})`}
            {tab === "optimizer" && "Optimizer"}
            {tab === "paper" && `Paper Runs (${paperRuns.length})`}
          </Button>
        ))}
      </div>

      <div className="hidden lg:flex flex-wrap gap-2 sm:gap-4 border-b border-slate-800 text-sm">
        {(["overview", "backtests", "optimizer", "paper"] as Tab[]).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "PRIMARY" : "GHOST"}
            size="sm"
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview" && "Overview"}
            {tab === "backtests" && `Backtests (${backtests.length})`}
            {tab === "optimizer" && "Optimizer"}
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
                __html: algorithm.notes_html || "<p>No notes provided.</p>",
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
            description={canOpenRunDetails ? "Historical runs for this strategy." : "Historical runs for this strategy. Run detail pages are owner-only."}
            columns={backtestColumns}
            data={backtests}
            loading={false}
            emptyMessage="No backtests yet."
            onRowClick={
              canOpenRunDetails ? (bt) => navigate(`/backtests/${bt.id}`) : undefined
            }
          />
        </div>
      )}

      {activeTab === "optimizer" && (
        <div className="hidden lg:block">
          {isOwner ? (
            renderOptimizerSection()
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Optimizer access is only available to the owner of this algorithm.
            </div>
          )}
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
            description={canOpenRunDetails ? "Live and past simulated trading sessions." : "Live and past simulated trading sessions. Run detail pages are owner-only."}
            columns={paperColumns}
            data={paperRuns}
            emptyMessage="No paper runs yet."
            onRowClick={
              canOpenRunDetails ? (run) => navigate(`/paper/${run.id}`) : undefined
            }
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
                __html: algorithm.notes_html || "<p>No notes provided.</p>",
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
            description={canOpenRunDetails ? "Historical runs for this strategy." : "Historical runs for this strategy. Run detail pages are owner-only."}
            columns={backtestColumns}
            data={backtests}
            loading={false}
            emptyMessage="No backtests yet."
            onRowClick={
              canOpenRunDetails ? (bt) => navigate(`/backtests/${bt.id}`) : undefined
            }
          />
        </div>
      )}

      {mobileTab === "optimizer" && (
        <div className="lg:hidden">
          {isOwner ? (
            renderOptimizerSection()
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Optimizer access is only available to the owner of this algorithm.
            </div>
          )}
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
            description={canOpenRunDetails ? "Live and past simulated trading sessions." : "Live and past simulated trading sessions. Run detail pages are owner-only."}
            columns={paperColumns}
            data={paperRuns}
            emptyMessage="No paper runs yet."
            onRowClick={
              canOpenRunDetails ? (run) => navigate(`/paper/${run.id}`) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
