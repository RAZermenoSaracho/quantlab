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

  // core
  exchange: string;
  symbol: string;
  timeframe: string;
  status: string;

  // relationships
  algorithm_id: string;
  algorithm_name?: string;

  // metrics (from LEFT JOIN metrics)
  total_return_percent?: number | null;
  total_return_usdt?: number | null;
  total_trades?: number | null;
  win_rate_percent?: number | null;
  profit_factor?: number | null;

  // metadata
  created_at: string;
}
