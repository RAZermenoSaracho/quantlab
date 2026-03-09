import axios from "axios";
import type { Candle, Symbol } from "@quantlab/contracts";
import type { ExchangeProvider } from "../types";

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

const BINANCE_DATA_BASE_URL = "https://data-api.binance.vision";
const BINANCE_FALLBACK_BASE_URL = "https://api.binance.com";
const SUB_MINUTE_INTERVALS = new Set(["1s", "5s", "15s", "30s"]);
const CACHE_TTL_MS = 5 * 60 * 1000;

export class BinanceProvider implements ExchangeProvider {
  private cachedSymbols: Symbol[] | null = null;
  private cacheTimestamp: number | null = null;

  async getSymbols(): Promise<Symbol[]> {
    const now = Date.now();
    if (
      this.cachedSymbols &&
      this.cacheTimestamp &&
      now - this.cacheTimestamp < CACHE_TTL_MS
    ) {
      return this.cachedSymbols;
    }

    const symbols = await this.fetchSymbolsWithFallback();

    this.cachedSymbols = symbols;
    this.cacheTimestamp = now;
    return symbols;
  }

  async getCandles(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<Candle[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50000));
    const requestedInterval = interval.toLowerCase();
    const sourceInterval = SUB_MINUTE_INTERVALS.has(requestedInterval)
      ? "1m"
      : interval;

    const expansionFactor =
      requestedInterval === "1s"
        ? 60
        : requestedInterval === "5s"
          ? 12
          : requestedInterval === "15s"
            ? 4
            : requestedInterval === "30s"
              ? 2
              : 1;

    const sourceLimit = SUB_MINUTE_INTERVALS.has(requestedInterval)
      ? Math.max(1, Math.min(Math.ceil(safeLimit / expansionFactor), 1000))
      : Math.max(1, Math.min(safeLimit, 1000));

    const klineRows = await this.fetchKlinesWithFallback({
      symbol,
      interval: sourceInterval,
      limit: sourceLimit,
    });

    const minuteCandles = klineRows.map((row) => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));

    if (!SUB_MINUTE_INTERVALS.has(requestedInterval)) {
      return minuteCandles;
    }

    const secondsPerBucket =
      requestedInterval === "1s"
        ? 1
        : requestedInterval === "5s"
          ? 5
          : requestedInterval === "15s"
            ? 15
            : 30;
    const slices = 60 / secondsPerBucket;
    const subminuteCandles: Candle[] = [];

    for (const candle of minuteCandles) {
      const minuteOpen = Number(candle.open);
      const minuteHigh = Number(candle.high);
      const minuteLow = Number(candle.low);
      const minuteClose = Number(candle.close);
      const minuteVolume = Number(candle.volume);
      let prevClose = minuteOpen;

      for (let index = 0; index < slices; index += 1) {
        const ratio = (index + 1) / slices;
        const close = minuteOpen + (minuteClose - minuteOpen) * ratio;
        const open = prevClose;

        let high = Math.max(open, close);
        let low = Math.min(open, close);

        if (index === 0) {
          high = Math.max(high, minuteHigh);
        }

        if (index === slices - 1) {
          low = Math.min(low, minuteLow);
        }

        subminuteCandles.push({
          timestamp: candle.timestamp + index * secondsPerBucket * 1000,
          open,
          high,
          low,
          close,
          volume: minuteVolume / slices,
        });

        prevClose = close;
      }
    }

    return subminuteCandles.slice(-safeLimit);
  }

  private async fetchKlinesWithFallback(params: {
    symbol: string;
    interval: string;
    limit: number;
  }): Promise<BinanceKlineRow[]> {
    try {
      return await this.fetchKlines(BINANCE_DATA_BASE_URL, params);
    } catch {
      return this.fetchKlines(BINANCE_FALLBACK_BASE_URL, params);
    }
  }

  private async fetchKlines(
    baseUrl: string,
    params: {
      symbol: string;
      interval: string;
      limit: number;
    }
  ): Promise<BinanceKlineRow[]> {
    const response = await axios.get<BinanceKlineRow[]>(
      `${baseUrl}/api/v3/klines`,
      {
        params,
        timeout: 10000,
      }
    );
    return response.data;
  }

  private async fetchSymbolsWithFallback(): Promise<Symbol[]> {
    try {
      return await this.fetchSymbols(BINANCE_DATA_BASE_URL);
    } catch {
      return this.fetchSymbols(BINANCE_FALLBACK_BASE_URL);
    }
  }

  private async fetchSymbols(baseUrl: string): Promise<Symbol[]> {
    const response = await axios.get<BinanceExchangeInfoResponse>(
      `${baseUrl}/api/v3/exchangeInfo`
    );

    return response.data.symbols
      .filter((item) => item.status === "TRADING")
      .map((item) => ({ symbol: item.symbol }));
  }
}
