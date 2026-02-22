import api from "./api.service";
import type { Exchange, Symbol } from "../types/models";

export function getExchanges() {
  return api.get<{ exchanges: Exchange[] }>(
    "/exchanges"
  );
}

export function getSymbols(
  exchange: string,
  query: string
) {
  return api.get<{ symbols: Symbol[] }>(
    "/market/symbols",
    { exchange, query }
  );
}

export function getDefaultFeeRate(exchange: string) {
  return api.get<{ default_fee_rate: number }>(
    "/market/fee-rate",
    { exchange }
  );
}
