import api from "./api.service";

import type {
  BacktestsListResponse,
  BacktestDetailResponse,
  CreateBacktestRequest,
  CreateBacktestResponse,
  BacktestStatusResponse,
} from "@quantlab/contracts";

/* ==============================
   GET ONE
============================== */

export function getBacktest(id: string): Promise<BacktestDetailResponse> {
  return api.get<BacktestDetailResponse>(`/backtests/${id}`);
}

/* ==============================
   GET ALL
============================== */

export function getAllBacktests(): Promise<BacktestsListResponse> {
  return api.get<BacktestsListResponse>("/backtests");
}

/* ==============================
   CREATE
============================== */

export function createBacktest(
  payload: CreateBacktestRequest
): Promise<CreateBacktestResponse> {
  return api.post<CreateBacktestResponse>("/backtests", payload);
}

/* ==============================
   DELETE
============================== */

export function deleteBacktest(id: string): Promise<{ message: string }> {
  return api.del<{ message: string }>(`/backtests/${id}`);
}

/* ==============================
   STATUS
============================== */

export function getBacktestStatus(runId: string): Promise<BacktestStatusResponse> {
  return api.get<BacktestStatusResponse>(`/backtests/${runId}/status`);
}