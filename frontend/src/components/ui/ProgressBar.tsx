interface ProgressBarProps {
  progress: number; // 0 - 100
  status?: "running" | "completed" | "error";
}

export default function ProgressBar({
  progress,
  status = "running",
}: ProgressBarProps) {

  const getColor = () => {
    if (status === "completed") return "bg-emerald-500";
    if (status === "error") return "bg-red-500";
    return "bg-sky-500";
  };

  const getMessage = () => {
    if (status === "completed") return "Backtest completed";
    if (status === "error") return "Backtest failed";

    // Dynamic messages based on progress
    if (progress < 20) return "Initializing engine...";
    if (progress < 55) return "Fetching historical market data...";
    if (progress < 80) return "Running strategy simulation...";
    if (progress < 100) return "Calculating performance metrics...";

    return "Finalizing...";
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{getMessage()}</span>
        <span>{Math.floor(progress)}%</span>
      </div>

      <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ease-out ${getColor()}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}