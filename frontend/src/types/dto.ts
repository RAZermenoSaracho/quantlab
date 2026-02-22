export interface CreateAlgorithmDto {
  name: string;
  description?: string;
  code?: string;
  githubUrl?: string;
}

export interface UpdateAlgorithmDto {
  name: string;
  description?: string;
  code: string;
}

export interface CreateBacktestDto {
  algorithm_id: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  start_date: string;
  end_date: string;
  fee_rate?: number;
}
