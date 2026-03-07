import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import FormCard from "../../components/ui/FormCard";
import Field from "../../components/ui/Field";
import Hint from "../../components/ui/Hint";
import type {
  Algorithm,
  Exchange,
  StartPaperRunRequest,
  Symbol,
} from "@quantlab/contracts";
import { useAlgorithms } from "../../data/algorithms";
import { useStartPaperRunMutation } from "../../data/paper";
import {
  useDefaultFeeRate,
  useExchanges,
  useSymbols,
} from "../../data/market";

export default function StartPaperRun() {

  const navigate = useNavigate();

  const [symbolQuery, setSymbolQuery] = useState("");
  const [debouncedSymbolQuery, setDebouncedSymbolQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<StartPaperRunRequest>({
    algorithm_id: "",
    exchange: "binance",
    symbol: "",
    timeframe: "1m",
    initial_balance: 1000,
  });

  const startMutation = useStartPaperRunMutation();
  const { data: algorithmsData } = useAlgorithms();
  const { data: exchangesData } = useExchanges();
  const { data: symbolsData } = useSymbols(form.exchange, debouncedSymbolQuery);
  const { data: feeRateData } = useDefaultFeeRate(form.exchange);
  const algorithms = useMemo<Algorithm[]>(
    () => algorithmsData ?? [],
    [algorithmsData]
  );
  const exchanges = useMemo<Exchange[]>(
    () => exchangesData ?? [],
    [exchangesData]
  );
  const symbols = useMemo<Symbol[]>(
    () => symbolsData ?? [],
    [symbolsData]
  );

  /* =====================================
     Load default fee when exchange changes
  ===================================== */

  useEffect(() => {
    if (!symbolQuery) {
      setDebouncedSymbolQuery("");
      return;
    }

    const timeout = window.setTimeout(() => {
      setDebouncedSymbolQuery(symbolQuery);
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [symbolQuery]);

  useEffect(() => {

    if (feeRateData) {
      setForm((prev) => ({
        ...prev,
        fee_rate: feeRateData.default_fee_rate,
      }));
    }
  }, [feeRateData]);

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

    try {

      setLoading(true);

      const res = await startMutation.mutate(form);

      navigate(`/paper/${res.run_id}`);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start paper run.");

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

        <FormCard
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

        </FormCard>

        {/* MARKET CONFIG */}

        <FormCard
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
                  setForm({
                    ...form,
                    timeframe:
                      e.target.value as StartPaperRunRequest["timeframe"],
                  })
                }
                className="form-input"
              >

                <option value="1s">1s</option>
                <option value="5s">5s</option>
                <option value="15s">15s</option>
                <option value="30s">30s</option>
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

          {/* SYMBOL SEARCH */}

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

                        setForm({
                          ...form,
                          symbol: s.symbol,
                        });

                        setSymbolQuery(s.symbol);

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

        </FormCard>

        {/* CAPITAL */}

        <FormCard
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

        </FormCard>

        {/* SUBMIT */}

        <div className="flex justify-end pt-6">

          <Button
            type="submit"
            variant="CREATE"
            size="lg"
            loading={loading}
            loadingText="Starting Session..."
          >
            Start Paper Trading
          </Button>

        </div>

      </form>

    </div>
  );
}
