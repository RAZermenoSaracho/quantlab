import axios from "axios";
import { env } from "../config/env";

/* =====================================================
   AXIOS ENGINE CLIENT
===================================================== */

const engineClient = axios.create({
  baseURL: env.ENGINE_URL,
  timeout: 30000,
});

/* =====================================================
   ERROR HANDLER
===================================================== */

function handleEngineError(error: any): never {
  if (error.response) {
    throw new Error(
      error.response.data?.detail ||
      error.response.data?.error ||
      "Engine request failed"
    );
  }

  throw new Error("Engine service unavailable");
}

/* =====================================================
   VALIDATE ALGORITHM
===================================================== */

export async function validateAlgorithm(code: string) {
  try {
    const response = await engineClient.post("/validate", { code });
    return response.data;
  } catch (error: any) {
    handleEngineError(error);
  }
}

/* =====================================================
   START PAPER TRADING
===================================================== */

interface StartPaperPayload {
  run_id: string;
  code: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  fee_rate?: number;
  api_key?: string;
  api_secret?: string;
  testnet?: boolean;
}

export async function startPaperOnEngine(
  payload: StartPaperPayload
) {
  try {
    const response = await engineClient.post("/paper/start", payload);
    return response.data;
  } catch (error: any) {
    handleEngineError(error);
  }
}

/* =====================================================
   STOP PAPER TRADING
===================================================== */

export async function stopPaperOnEngine(runId: string) {
  try {
    const response = await engineClient.post(`/paper/stop/${runId}`);
    return response.data;
  } catch (error: any) {
    handleEngineError(error);
  }
}