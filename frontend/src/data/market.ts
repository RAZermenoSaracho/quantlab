import {
  getDefaultFeeRate,
  getExchanges,
  getSymbols,
} from "../services/market.service";
import {
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
