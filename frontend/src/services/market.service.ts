import api from "./api";

export function getExchanges() {
  return api.get("/exchanges");
}

export function getSymbols(exchange: string, query: string) {
  return api.get(
    `/market/symbols?exchange=${exchange}&query=${query}`
  );
}

export function getDefaultFeeRate(exchange: string) {
  return api.get(
    `/market/fee-rate?exchange=${exchange}`
  );
}
