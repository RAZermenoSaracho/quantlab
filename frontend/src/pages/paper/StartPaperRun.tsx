import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startPaperRun } from "../../services/paper.service";
import { getAlgorithms } from "../../services/algorithm.service";

type FormState = {
  algorithm_id: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
};

interface Algorithm {
  id: string;
  name: string;
}

export default function StartPaperRun() {
  const navigate = useNavigate();

  const [algorithms, setAlgorithms] = useState<Algorithm[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    algorithm_id: "",
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1m",
    initial_balance: 1000,
  });

  /* ===============================
     Load Algorithms
  =============================== */
  useEffect(() => {
    async function fetchAlgorithms() {
      try {
        const data = await getAlgorithms();
        setAlgorithms(data ?? []);
      } catch (err) {
        console.error("Failed to load algorithms:", err);
        setAlgorithms([]);
      }
    }

    fetchAlgorithms();
  }, []);

  /* ===============================
     Submit
  =============================== */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.algorithm_id) {
      return setError("Please select an algorithm.");
    }

    try {
      setLoading(true);
      const res = await startPaperRun(form);
      navigate(`/paper/${res.run_id}`);
    } catch (err: any) {
      setError(err.message || "Failed to start paper run.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">

      {/* HEADER */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">
          Start Paper Trading Session
        </h1>
        <p className="text-slate-400 max-w-2xl">
          Run your algorithm live against real market data using simulated capital.
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
          description="Choose the algorithm that will generate signals."
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
              {algorithms.map((algo) => (
                <option key={algo.id} value={algo.id}>
                  {algo.name}
                </option>
              ))}
            </select>
          </Field>
        </Card>

        {/* MARKET CONFIG */}
        <Card
          title="Market Configuration"
          description="Select exchange, symbol and timeframe."
        >
          <div className="grid md:grid-cols-2 gap-8">

            {/* Exchange */}
            <Field label="Exchange">
              <select
                value={form.exchange}
                onChange={(e) =>
                  setForm({ ...form, exchange: e.target.value })
                }
                className="form-input"
              >
                <option value="binance">Binance</option>
              </select>
            </Field>

            {/* Timeframe */}
            <Field label="Timeframe">
              <select
                value={form.timeframe}
                onChange={(e) =>
                  setForm({ ...form, timeframe: e.target.value })
                }
                className="form-input"
              >
                <option value="1m">1m</option>
                <option value="3m">3m</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
            </Field>

          </div>

          {/* Symbol */}
          <div className="mt-8">
            <Field label="Market Symbol">
              <input
                type="text"
                value={form.symbol}
                onChange={(e) =>
                  setForm({
                    ...form,
                    symbol: e.target.value.toUpperCase(),
                  })
                }
                placeholder="BTCUSDT"
                className="form-input"
                required
              />
            </Field>
          </div>
        </Card>

        {/* CAPITAL */}
        <Card
          title="Capital"
          description="Initial capital used for the paper session."
        >
          <Field label="Initial Balance (USDT)">
            <input
              type="number"
              value={form.initial_balance}
              onChange={(e) =>
                setForm({
                  ...form,
                  initial_balance: Number(e.target.value),
                })
              }
              className="form-input"
              required
            />
          </Field>
        </Card>

        {/* SUBMIT */}
        <div className="flex justify-end pt-6">
          <button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 px-10 py-3 rounded-xl text-white font-semibold shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? "Starting Session..." : "Start Paper Trading"}
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
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-slate-400 text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-300">{label}</label>
      {children}
    </div>
  );
}