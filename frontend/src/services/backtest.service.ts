// src/services/backtest.service.ts

import api from "./api.service";
import type { BacktestRun } from "../types/models";
import type { CreateBacktestDto } from "../types/dto";

/* ==============================
   TYPES
============================== */

export interface BacktestsListResponse {
  backtests: BacktestRun[];
}

/* ==============================
   GET ONE
============================== */
export function getBacktest(id: string) {
  return api.get<any>(`/backtest/${id}`);
}

/* ==============================
   GET ALL
============================== */
export function getAllBacktests(): Promise<BacktestsListResponse> {
  return api.get<BacktestsListResponse>("/backtest");
}

/* ==============================
   CREATE
============================== */
export function createBacktest(payload: CreateBacktestDto) {
  return api.post<{ run_id: string }>(
    "/backtest",
    payload
  );
}

/* ==============================
   DELETE
============================== */
export function deleteBacktest(id: string) {
  return api.del<{ message: string }>(
    `/backtest/${id}`
  );
}
