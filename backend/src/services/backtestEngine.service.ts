import axios from "axios";
import { env } from "../config/env";
import {
  BacktestEngineRequestSchema,
  BacktestEngineResponseSchema,
  BacktestProgressEngineResponseSchema,
  type BacktestEngineRequest,
  type BacktestEngineResult,
} from "@quantlab/contracts";
import type { EngineErrorPayload } from "../types/engine";

function handleEngineError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as EngineErrorPayload | undefined;

    throw new Error(
      payload?.detail ||
      (typeof payload?.error === "string"
        ? payload.error
        : payload?.error?.message) ||
      payload?.message ||
      "Engine error"
    );
  }

  if (error instanceof Error) {
    throw error;
  }

  throw new Error("Engine unavailable");
}

export async function runBacktestOnEngine(
  runId: string,
  payload: Omit<BacktestEngineRequest, "run_id">
): Promise<BacktestEngineResult> {
  try {
    const request = BacktestEngineRequestSchema.parse({
      ...payload,
      run_id: runId,
    });

    const response = await axios.post(
      `${env.ENGINE_URL}/backtests`,
      request
    );

    const parsed = BacktestEngineResponseSchema.parse(response.data);

    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }

    return parsed.data;
  } catch (error: unknown) {
    handleEngineError(error);
  }
}

export async function getEngineProgress(runId: string): Promise<number> {
  try {
    const res = await axios.get(
      `${env.ENGINE_URL}/backtest-progress/${runId}`
    );

    return BacktestProgressEngineResponseSchema.parse(res.data).progress;
  } catch (error: unknown) {
    handleEngineError(error);
  }
}
