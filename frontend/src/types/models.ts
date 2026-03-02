/* =========================
   Enums
========================= */

export type BacktestStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type PaperRunStatus = "ACTIVE" | "STOPPED" | "FAILED";

export type PaperTradeSide = "BUY" | "SELL";
export type PaperPositionSide = "LONG" | "SHORT";

/* =========================
   Core Domain Models
========================= */

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

/* =========================
   Backtest
========================= */

export interface BacktestAnalysis {
  summary?: {
    net_profit?: number;
    return_pct?: number;
    total_trades?: number;
    win_rate_percent?: number;
    profit_factor?: number;
  };
  risk?: {
    sharpe?: number;
    volatility?: number;
    max_drawdown_pct?: number;
  };
}

export interface BacktestRun {
  id: string;

  exchange: string;
  symbol: string;
  timeframe: string;

  status: BacktestStatus;

  algorithm_id: string;
  algorithm_name?: string;

  // métricas planas (si backend hace join)
  total_return_percent?: number | null;
  total_return_usdt?: number | null;
  total_trades?: number | null;
  win_rate_percent?: number | null;
  profit_factor?: number | null;

  // JSON analysis
  analysis?: BacktestAnalysis | null;

  created_at: string;
}

/* =========================
   Paper Trading
========================= */

export interface PaperTrade {
  id?: string;
  run_id: string;
  side: PaperTradeSide;
  entry_price: number;
  exit_price?: number | null;
  quantity: number;
  pnl?: number | null;
  pnl_percent?: number | null;
  opened_at?: string | null;
  closed_at?: string | null;
}

export interface PaperPosition {
  side: PaperPositionSide;
  quantity: number;
  entry_price: number;
  opened_at?: number | string | null; // tu payload trae ms unix, DB podría traer string
}

export interface PaperRun {
  id: string;
  user_id: string;
  algorithm_id: string;

  algorithm_name?: string | null;
  algorithm_description?: string | null;

  exchange: string;
  symbol: string;
  timeframe: string;

  status: PaperRunStatus;

  // NUMERIC de Postgres normalmente llega como string:
  initial_balance: string;
  current_balance: string;

  quote_balance?: string | null;
  base_balance?: string | null;
  equity?: string | null;
  last_price?: string | null;
  fee_rate?: string | null;

  position?: PaperPosition | null;

  engine_session_id?: string | null;

  started_at?: string | null;
  updated_at?: string | null;
}