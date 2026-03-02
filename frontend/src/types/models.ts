export interface Algorithm {
  id: string;
  name: string;
  notes_html: string | null;
  code: string;
  github_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Exchange {
  id: string;
  name: string;
  default_fee_rate: number;
}

export interface Symbol {
  symbol: string;
}

export interface BacktestRun {
  id: string;

  exchange: string;
  symbol: string;
  timeframe: string;
  status: string;

  algorithm_id: string;
  algorithm_name?: string;

  total_return_percent?: number | null;
  total_return_usdt?: number | null;
  total_trades?: number | null;
  win_rate_percent?: number | null;
  profit_factor?: number | null;

  created_at: string;
}

export type PaperRunStatus = "ACTIVE" | "STOPPED" | "FAILED";

export interface PaperTrade {
  id?: string;
  run_id: string;
  side: "BUY" | "SELL";
  entry_price: number;
  exit_price?: number | null;
  quantity: number;
  pnl?: number | null;
  pnl_percent?: number | null;
  opened_at?: string | null;
  closed_at?: string | null;
}

export type PaperPositionSide = "LONG" | "SHORT";

export interface PaperPosition {
  side: PaperPositionSide;
  quantity: number;
  entry_price: number;
  opened_at?: string | null;
}

export interface PaperRun {
  id: string;
  user_id: string;
  algorithm_id: string;

  symbol: string;
  timeframe: string;
  exchange: string;

  status: PaperRunStatus;

  /* ===== Core Balances ===== */

  initial_balance: number | string;
  current_balance: number | string;

  /* ===== Live Accounting (NEW) ===== */

  quote_balance?: number;   // e.g. USDT available
  base_balance?: number;    // e.g. BTC held
  equity?: number;          // total account value in quote
  last_price?: number;      // last market price

  position?: PaperPosition | null;

  /* ===== Metadata ===== */

  started_at?: string | null;
  updated_at?: string | null;

  fee_rate?: number | string | null;
  algorithm_name?: string | null;
}