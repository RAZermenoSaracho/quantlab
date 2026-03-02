/* =========================
   Algorithm
========================= */

export interface CreateAlgorithmDto {
  name: string;
  notes_html?: string;
  code?: string;
  githubUrl?: string;
}

export interface UpdateAlgorithmDto {
  name?: string;
  notes_html?: string;
  code?: string;
}

/* =========================
   Backtest
========================= */

export interface CreateBacktestDto {
  algorithm_id: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  start_date: string; // ISO
  end_date: string;   // ISO
  fee_rate?: number;
}
