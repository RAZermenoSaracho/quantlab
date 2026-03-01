import axios from "axios";
import { env } from "../config/env";

export async function runBacktestOnEngine(
  runId: string,
  payload: {
    code: string;
    exchange: string;
    symbol: string;
    timeframe: string;
    initial_balance: number;
    start_date: string;
    end_date: string;
    fee_rate?: number;
  }) {
  try {
    const response = await axios.post(
      `${env.ENGINE_URL}/backtests`,
      {
        ...payload,
        run_id: runId,
      },
    );

    const data = response.data;

    // Log raw response in debug mode
    console.debug("Engine raw response:", data);

    if (!data) {
      throw new Error("Engine returned empty response");
    }

    if (data.success === false) {
      throw new Error(data.error || "Engine reported failure");
    }

    // Normalize wrapper
    if (data.success && data.data) {
      return data.data;
    }

    return data;

  } catch (error: any) {
    if (error.response) {
      console.error("Engine error response:", error.response.data);
      throw new Error(error.response.data.detail || "Engine error");
    }

    console.error("Engine connection error:", error.message);
    throw new Error("Engine unavailable");
  }
}

export async function getEngineProgress(runId: string) {
  const res = await axios.get(
    `${env.ENGINE_URL}/backtest-progress/${runId}`
  );
  return res.data;
}