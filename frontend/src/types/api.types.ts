import type { BacktestRun, PaperRun, PaperTrade } from "./models";

/* =========================
   Generic API Wrappers
========================= */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    details?: unknown;
  };
}

/* =========================
   Backtests
========================= */

export interface BacktestsListResponse {
  backtests: BacktestRun[];
}

/* =========================
   Paper Trading
========================= */

export interface PaperRunDetailResponse {
  run: PaperRun;
  trades: PaperTrade[];
}