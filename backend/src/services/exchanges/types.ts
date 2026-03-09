import type { Candle, Symbol } from "@quantlab/contracts";

export interface ExchangeProvider {
  getSymbols(): Promise<Symbol[]>;
  getCandles(symbol: string, interval: string, limit: number): Promise<Candle[]>;
}
