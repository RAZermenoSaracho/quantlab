import api from "./api.service";

import type {
  CandlesResponse,
  ExchangesListResponse,
  SymbolsListResponse,
  DefaultFeeRateResponse,
} from "@quantlab/contracts";

/* ==============================
   EXCHANGES
============================== */

export function getExchanges(): Promise<ExchangesListResponse> {
  return api.get<ExchangesListResponse>("/exchanges");
}

/* ==============================
   SYMBOLS
============================== */

export function getSymbols(
  exchange: string,
  query: string
): Promise<SymbolsListResponse> {
  return api.get<SymbolsListResponse>("/market/symbols", { exchange, query });
}

/* ==============================
   DEFAULT FEE RATE
============================== */

export function getDefaultFeeRate(exchange: string): Promise<DefaultFeeRateResponse> {
  return api.get<DefaultFeeRateResponse>("/market/fee-rate", { exchange });
}

/* ==============================
   CANDLES
============================== */

export function getCandles(
  symbol: string,
  interval: string,
  limit = 500
): Promise<CandlesResponse> {
  return api.get<CandlesResponse>("/market/candles", {
    symbol,
    interval,
    limit,
  });
}
