export type ExchangeCatalogItem = {
  id: string;
  name: string;
  default_fee_rate: number;
  supported_timeframes: string[];
};

const EXCHANGES: ExchangeCatalogItem[] = [
  {
    id: "binance",
    name: "Binance",
    default_fee_rate: 0.001,
    supported_timeframes: [
      "1m",
      "5m",
      "15m",
      "30m",
      "1h",
      "4h",
      "1d"
    ]
  }
];

export function getSupportedExchanges(): ExchangeCatalogItem[] {
  return EXCHANGES;
}

export function getExchangeById(id: string): ExchangeCatalogItem | undefined {
  return EXCHANGES.find(e => e.id === id);
}
