import api from "./api.service";
import type { BacktestRun } from "../types/models";
import type { CreateBacktestDto } from "../types/dto";

export function getBacktest(id: string) {
  return api.get<any>(`/backtest/${id}`);
}

export function getAllBacktests() {
  return api.get<BacktestRun[]>("/backtest");
}

export function createBacktest(payload: CreateBacktestDto) {
  return api.post<{ run_id: string }>(
    "/backtest",
    payload
  );
}

export function deleteBacktest(id: string) {
  return api.del<{ message: string }>(
    `/backtest/${id}`
  );
}
