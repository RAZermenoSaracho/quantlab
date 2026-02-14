import BacktestsList from "./backtests/BacktestsList";

export default function Dashboard() {
  return (
    <div className="p-6 space-y-10">
      <h1 className="text-3xl font-bold text-white">
        Dashboard
      </h1>

      {/* Aquí luego meteremos KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-400 text-sm">
            Total Backtests
          </p>
          <p className="text-2xl font-bold text-white mt-2">
            —
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-400 text-sm">
            Avg Return
          </p>
          <p className="text-2xl font-bold text-white mt-2">
            —
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <p className="text-slate-400 text-sm">
            Win Rate
          </p>
          <p className="text-2xl font-bold text-white mt-2">
            —
          </p>
        </div>
      </div>

      {/* Recent Backtests */}
      <BacktestsList limit={5} showTitle />
    </div>
  );
}
