import axios from "axios";
import { env } from "../config/env";

export async function runBacktestOnEngine(payload: {
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
      `${env.ENGINE_URL}/backtest`,
      payload
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