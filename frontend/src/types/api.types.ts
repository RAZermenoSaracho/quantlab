import type { BacktestRun, PaperRun, PaperTrade } from "./models";

export interface BacktestsListResponse {
  backtests: BacktestRun[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    message: string;
    details?: any;
  };
}

export interface PaperRunDetailResponse {
  run: PaperRun;
  trades: PaperTrade[];
}