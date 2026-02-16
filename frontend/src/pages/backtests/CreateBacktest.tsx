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
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Run Historical Backtest
        </h1>
        <p className="text-slate-400 text-sm">
          Simulate your trading algorithm on historical Binance market data.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 text-red-400 p-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Algorithm */}
        <Field label="Trading Strategy">
          <select
            value={form.algorithm_id}
            onChange={(e) =>
              setForm({ ...form, algorithm_id: e.target.value })
            }
            required
            className="input"
          >
            <option value="">Select algorithm</option>
            {algorithms.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Hint>
            Choose the strategy logic you want to evaluate.
          </Hint>
        </Field>

        {/* Symbol */}
        <Field label="Market Symbol">
          <input
            value={form.symbol}
            onChange={(e) =>
              setForm({ ...form, symbol: e.target.value.toUpperCase() })
            }
            className="input"
            required
          />
          <Hint>
            Example: BTCUSDT, ETHUSDT
          </Hint>
        </Field>

        {/* Timeframe */}
        <Field label="Candle Timeframe">
          <select
            value={form.timeframe}
            onChange={(e) =>
              setForm({ ...form, timeframe: e.target.value })
            }
            className="input"
          >
            <option value="1m">1 Minute</option>
            <option value="5m">5 Minutes</option>
            <option value="15m">15 Minutes</option>
            <option value="1h">1 Hour</option>
            <option value="4h">4 Hours</option>
            <option value="1d">1 Day</option>
          </select>
          <Hint>
            Determines how market data is aggregated.
          </Hint>
        </Field>

        {/* Date Range */}
        <div className="grid md:grid-cols-2 gap-6">
          <Field label="Start Date">
            <input
              type="date"
              value={form.start_date}
              onChange={(e) =>
                setForm({ ...form, start_date: e.target.value })
              }
              className="input"
              required
            />
          </Field>

          <Field label="End Date">
            <input
              type="date"
              value={form.end_date}
              onChange={(e) =>
                setForm({ ...form, end_date: e.target.value })
              }
              className="input"
              required
            />
          </Field>
        </div>

        {/* Balance */}
        <Field label="Initial Capital (USDT)">
          <input
            type="number"
            value={form.initial_balance}
            onChange={(e) =>
              setForm({ ...form, initial_balance: Number(e.target.value) })
            }
            className="input"
            required
          />
          <Hint>
            Starting balance for the simulation.
          </Hint>
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="bg-sky-600 hover:bg-sky-700 px-6 py-3 rounded-lg text-white font-medium"
        >
          {loading ? "Running Backtest..." : "Run Backtest"}
        </button>
      </form>
    </div>
  );
}

/* UI helpers */
function Field({ label, children }: any) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-slate-300 font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Hint({ children }: any) {
  return (
    <p className="text-xs text-slate-500">
      {children}
    </p>
  );
}
