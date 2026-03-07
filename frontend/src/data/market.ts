import {
  getCandles,
  getDefaultFeeRate,
  getExchanges,
  getSymbols,
} from "../services/market.service";
import {
  candlesKey,
  defaultFeeRateKey,
  EXCHANGES,
  symbolsKey,
} from "./keys";
import { useQuery } from "./useQuery";

export function useExchanges() {
  return useQuery({
    key: EXCHANGES,
    fetcher: async () => (await getExchanges()).exchanges,
  });
}

export function useSymbols(exchange: string, query: string) {
  return useQuery({
    key: symbolsKey(exchange, query),
    fetcher: async () => (await getSymbols(exchange, query)).symbols,
    enabled: Boolean(exchange) && Boolean(query),
  });
}

export function useDefaultFeeRate(exchange: string) {
  return useQuery({
    key: defaultFeeRateKey(exchange),
    fetcher: () => getDefaultFeeRate(exchange),
    enabled: Boolean(exchange),
  });
}

export function useCandles(symbol: string, interval: string, limit = 500) {
  return useQuery({
    key: candlesKey(symbol, interval, limit),
    fetcher: async () => (await getCandles(symbol, interval, limit)).candles,
    enabled: Boolean(symbol) && Boolean(interval),
  });
}
