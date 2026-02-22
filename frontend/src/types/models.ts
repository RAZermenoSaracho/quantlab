export interface Algorithm {
  id: string;
  name: string;
  description?: string;
  created_at: string;
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
}

export interface BacktestRun {
  id: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  status: string;
  created_at: string;
}

export interface Exchange {
  id: string;
  name: string;
  default_fee_rate: number;
}

export interface Symbol {
  symbol: string;
}
