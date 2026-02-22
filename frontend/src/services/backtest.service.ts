import api from "./api";

/* ==============================
   GET ONE
============================== */
export function getBacktest(id: string) {
  return api.get(`/backtest/${id}`);
}

/* ==============================
   GET ALL
============================== */
export function getAllBacktests() {
  return api.get(`/backtest`);
}

/* ==============================
   CREATE
============================== */
export function createBacktest(payload: {
  algorithm_id: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  start_date: string;
  end_date: string;
  fee_rate?: number;
}) {
  return api.post(`/backtest`, payload);
}

/* ==============================
   DELETE
============================== */
export function deleteBacktest(id: string) {
  return api.del(`/backtest/${id}`);
}
