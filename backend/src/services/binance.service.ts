import axios from "axios";

type BinanceSymbol = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
};

const BINANCE_BASE_URL = "https://api.binance.com";

let cachedSymbols: BinanceSymbol[] | null = null;
let cacheTimestamp: number | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getBinanceSymbols(): Promise<BinanceSymbol[]> {
  const now = Date.now();

  // Return cache if valid
  if (
    cachedSymbols &&
    cacheTimestamp &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedSymbols;
  }

  const response = await axios.get(
    `${BINANCE_BASE_URL}/api/v3/exchangeInfo`
  );

  const symbols: BinanceSymbol[] = response.data.symbols
    .filter((s: any) => s.status === "TRADING")
    .map((s: any) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
    }));

  cachedSymbols = symbols;
  cacheTimestamp = now;

  return symbols;
}
