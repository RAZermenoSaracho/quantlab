import axios from "axios";
import type { Candle, Symbol } from "@quantlab/contracts";

type BinanceSymbol = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
};

type BinanceExchangeInfoResponse = {
  symbols: Array<
    BinanceSymbol & {
      status: string;
    }
  >;
};

type BinanceKlineRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

const BINANCE_BASE_URL = "https://api.binance.com";

let cachedSymbols: Symbol[] | null = null;
let cacheTimestamp: number | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getBinanceSymbols(): Promise<Symbol[]> {
  const now = Date.now();

  // Return cache if valid
  if (
    cachedSymbols &&
    cacheTimestamp &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedSymbols;
  }

  const response = await axios.get<BinanceExchangeInfoResponse>(
    `${BINANCE_BASE_URL}/api/v3/exchangeInfo`
  );

  const symbols: Symbol[] = response.data.symbols
    .filter((s) => s.status === "TRADING")
    .map((s) => ({
      symbol: s.symbol,
    }));

  cachedSymbols = symbols;
  cacheTimestamp = now;

  return symbols;
}

export async function getBinanceCandles(
  symbol: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const safeLimit = Math.max(1, Math.min(limit, 1000));

  const response = await axios.get<BinanceKlineRow[]>(
    `${BINANCE_BASE_URL}/api/v3/klines`,
    {
      params: {
        symbol,
        interval,
        limit: safeLimit,
      },
    }
  );

  return response.data.map((row) => ({
    timestamp: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));
}
