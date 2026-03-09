import type { Candle, Symbol } from "@quantlab/contracts";
import { BinanceProvider } from "./providers/binance.provider";
import type { ExchangeProvider } from "./types";

const providers: Record<string, ExchangeProvider> = {
  binance: new BinanceProvider(),
};

function resolveProvider(exchange: string): ExchangeProvider {
  const provider = providers[exchange];
  if (!provider) {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }
  return provider;
}

export async function getSymbols(exchange: string): Promise<Symbol[]> {
  return resolveProvider(exchange).getSymbols();
}

export async function getCandles(
  exchange: string,
  symbol: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  return resolveProvider(exchange).getCandles(symbol, interval, limit);
}
