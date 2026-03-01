import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getAlgorithms } from "../../services/algorithm.service";
import { createBacktest, getBacktestStatus } from "../../services/backtest.service";
import {
  getExchanges,
  getSymbols,
  getDefaultFeeRate,
} from "../../services/market.service";
import DateSection from "../../components/backtests/DateSection";
import ProgressBar from "../../components/ui/ProgressBar";

type FormState = {
  algorithm_id: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  start_date: string;
  end_date: string;
  fee_rate?: number;
};

export default function CreateBacktest() {
  const navigate = useNavigate();

  const [algorithms, setAlgorithms] = useState<any[]>([]);
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [symbols, setSymbols] = useState<any[]>([]);
  const [symbolQuery, setSymbolQuery] = useState("");

  const [form, setForm] = useState<FormState>({
    algorithm_id: "",
    exchange: "binance",
    symbol: "",
    timeframe: "1h",
    initial_balance: 1000,
    start_date: "",
    end_date: "",
    fee_rate: undefined,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const [runId, setRunId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* =====================================
     Load algorithms
  ===================================== */
  useEffect(() => {
    async function load() {
      const data = await getAlgorithms();
      setAlgorithms(data);
    }
    load();
  }, []);

  /* =====================================
     Load exchanges
  ===================================== */
  useEffect(() => {
    async function load() {
      const data = await getExchanges();
      setExchanges(data.exchanges || []);
    }
    load();
  }, []);

  /* =====================================
     Load default fee when exchange changes
  ===================================== */
  useEffect(() => {
    async function loadFee() {
      if (!form.exchange) return;
      const data = await getDefaultFeeRate(form.exchange);

      setForm((prev) => ({
        ...prev,
        fee_rate: data.default_fee_rate,
      }));
    }

    loadFee();
  }, [form.exchange]);

  /* =====================================
     Symbol search (debounced)
  ===================================== */
  useEffect(() => {
    if (!symbolQuery) return;

    const timeout = setTimeout(async () => {
      const data = await getSymbols(form.exchange, symbolQuery);
      setSymbols(data.symbols || []);
    }, 300);

    return () => clearTimeout(timeout);
  }, [symbolQuery, form.exchange]);

  useEffect(() => {
    if (!runId) return;

    pollingRef.current = setInterval(async () => {
      try {
        const statusData = await getBacktestStatus(runId);
        const newProgress = statusData.progress ?? 0;
        setProgress(newProgress);

        if (statusData.status === "COMPLETED") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }

          setProgress(100);

          setTimeout(() => {
            navigate(`/backtests/${runId}`);
          }, 500);
        }

        if (statusData.status === "FAILED") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }

          setIsRunning(false);
          setError("Backtest failed.");
        }

      } catch (err) {
        console.error("❌ Polling error:", err);

        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }

        setIsRunning(false);
        setError("Failed to fetch progress.");
      }
    }, 500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };

  }, [runId, navigate]);

  /* =====================================
     Submit
  ===================================== */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.algorithm_id) {
      return setError("Please select an algorithm.");
    }

    if (!form.symbol) {
      return setError("Please select a symbol.");
    }

    if (form.start_date >= form.end_date) {
      return setError("Start date must be before end date.");
    }

    try {
      setLoading(true);
      setIsRunning(true);
      setProgress(0);

      const result = await createBacktest(form);
      const newRunId = result.run_id;

      setRunId(newRunId);

    } catch (err: any) {
      setError(err.message || "Failed to create backtest.");
      setIsRunning(false);
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
          Simulate your trading algorithm using historical market data.
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
          description="Choose the algorithm that will generate trading signals."
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
                {exchanges.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
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
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
            </Field>

          </div>

          {/* Symbol Search */}
          <div className="mt-8">
            <Field label="Market Symbol">
              <input
                value={symbolQuery}
                onChange={(e) =>
                  setSymbolQuery(e.target.value.toUpperCase())
                }
                placeholder="Search symbol (BTC, ETH...)"
                className="form-input"
              />

              {symbols.length > 0 && (
                <div className="bg-slate-900 border border-slate-700 rounded mt-2 max-h-48 overflow-y-auto">
                  {symbols.map((s) => (
                    <div
                      key={s.symbol}
                      onClick={() => {
                        setForm({ ...form, symbol: s.symbol });
                        setSymbolQuery(s.symbol);
                        setSymbols([]);
                      }}
                      className="px-4 py-2 hover:bg-slate-800 cursor-pointer text-white"
                    >
                      {s.symbol}
                    </div>
                  ))}
                </div>
              )}

              {form.symbol && (
                <Hint>
                  Selected: <span className="text-sky-400">{form.symbol}</span>
                </Hint>
              )}
            </Field>
          </div>

          {/* Fee */}
          <div className="mt-8">
            <Field label="Trading Fee Rate">
              <input
                type="number"
                step="0.0001"
                value={form.fee_rate ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fee_rate:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
                className="form-input"
              />
              <Hint>
                Default exchange fee. Set to 0 to simulate no fees.
              </Hint>
            </Field>
          </div>
        </Card>

        {/* DATE RANGE */}
        <DateSection
          start={form.start_date}
          end={form.end_date}
          onChange={(start, end) =>
            setForm({ ...form, start_date: start, end_date: end })
          }
        />

        {/* CAPITAL */}
        <Card
          title="Capital"
          description="Initial capital used in the simulation."
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
        {isRunning && (
          <ProgressBar
            progress={Math.floor(progress)}
            status={
              progress >= 100
                ? "completed"
                : "running"
            }
          />
        )}
        <div className="flex justify-end pt-6">
          <button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 px-10 py-3 rounded-xl text-white font-semibold shadow-lg transition-all disabled:opacity-50"
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

function Hint({ children }: any) {
  return (
    <p className="text-xs text-slate-500 mt-1">{children}</p>
  );
}
