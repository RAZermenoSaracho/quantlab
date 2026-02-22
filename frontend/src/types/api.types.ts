import type { BacktestRun } from "./models";

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
