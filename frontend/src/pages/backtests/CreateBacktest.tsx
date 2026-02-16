import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAlgorithms } from "../../services/algorithm.service";
import { createBacktest } from "../../services/backtest.service";

export default function CreateBacktest() {
  const navigate = useNavigate();

  const [algorithms, setAlgorithms] = useState<any[]>([]);
  const [form, setForm] = useState({
    algorithm_id: "",
    symbol: "BTCUSDT",
    timeframe: "1h",
    initial_balance: 1000,
    start_date: "",
    end_date: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const data = await getAlgorithms();
      setAlgorithms(data);
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await createBacktest(form);
      navigate(`/backtest/${result.run_id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-12">

      {/* HEADER */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">
          Run Historical Backtest
        </h1>
        <p className="text-slate-400 max-w-2xl">
          Simulate your trading algorithm using historical Binance market data
          to evaluate profitability, drawdowns and trade performance.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-800 text-red-400 p-4 rounded-xl">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-10">

        {/* STRATEGY */}
        <Card
          title="Strategy Selection"
          description="Choose the trading algorithm logic that will generate buy and sell signals."
        >
          <Field label="Trading Strategy">
            <select
              value={form.algorithm_id}
              onChange={(e) =>
                setForm({ ...form, algorithm_id: e.target.value })
              }
              required
              className="form-input"
            >
              <option value="">Select an algorithm</option>
              {algorithms.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <Hint>
              This determines the decision-making logic for the backtest.
            </Hint>
          </Field>
        </Card>

        {/* MARKET SETTINGS */}
        <Card
          title="Market Configuration"
          description="Define the asset and timeframe used for historical simulation."
        >
          <div className="grid md:grid-cols-2 gap-8">

            <Field label="Market Symbol">
              <input
                value={form.symbol}
                onChange={(e) =>
                  setForm({ ...form, symbol: e.target.value.toUpperCase() })
                }
                className="form-input"
                required
              />
              <Hint>
                Example: BTCUSDT, ETHUSDT, SOLUSDT
              </Hint>
            </Field>

            <Field label="Candle Timeframe">
              <select
                value={form.timeframe}
                onChange={(e) =>
                  setForm({ ...form, timeframe: e.target.value })
                }
                className="form-input"
              >
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
                <option value="1d">1 Day</option>
              </select>
              <Hint>
                Determines how price data is aggregated.
              </Hint>
            </Field>

          </div>
        </Card>

        {/* DATE RANGE */}
        <Card
          title="Backtest Period"
          description="Choose the historical time range used for analysis."
        >
          <div className="grid md:grid-cols-2 gap-8">

            <Field label="Start Date">
              <input
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
                className="form-input"
                required
              />
              <Hint>
                Beginning of the simulation period.
              </Hint>
            </Field>

            <Field label="End Date">
              <input
                type="date"
                value={form.end_date}
                onChange={(e) =>
                  setForm({ ...form, end_date: e.target.value })
                }
                className="form-input"
                required
              />
              <Hint>
                End of the simulation period.
              </Hint>
            </Field>

          </div>
        </Card>

        {/* CAPITAL */}
        <Card
          title="Capital Configuration"
          description="Set the starting capital used during the backtest simulation."
        >
          <Field label="Initial Capital (USDT)">
            <input
              type="number"
              value={form.initial_balance}
              onChange={(e) =>
                setForm({ ...form, initial_balance: Number(e.target.value) })
              }
              className="form-input"
              required
            />
            <Hint>
              Starting balance used to calculate returns and drawdowns.
            </Hint>
          </Field>
        </Card>

        {/* SUBMIT */}
        <div className="flex justify-end pt-6">
          <button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 px-10 py-3 rounded-xl text-white font-semibold text-sm shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? "Running Backtest..." : "Run Backtest"}
          </button>
        </div>

      </form>
    </div>
  );
}

/* ==============================
   UI COMPONENTS
============================== */

function Card({ title, description, children }: any) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-8 space-y-6 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">
          {title}
        </h2>
        <p className="text-slate-400 text-sm">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-300">
        {label}
      </label>
      {children}
    </div>
  );
}

function Hint({ children }: any) {
  return (
    <p className="text-xs text-slate-500 mt-1">
      {children}
    </p>
  );
}
