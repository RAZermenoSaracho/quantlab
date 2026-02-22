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
  created_at: string;
}
