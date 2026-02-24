from datetime import datetime
from typing import List, Any

from binance.client import Client

from .base import BaseExchangeClient


class BinanceClient(BaseExchangeClient):

    def __init__(self):
        # No API key required for public market data
        self.client = Client()

    def fetch_candles(
        self,
        symbol: str,
        timeframe: str,
        start_date: str,
        end_date: str
    ) -> List[Any]:

        # Convert ISO format to Binance-readable format
        start_str = datetime.fromisoformat(start_date).strftime("%d %b, %Y %H:%M:%S")
        end_str = datetime.fromisoformat(end_date).strftime("%d %b, %Y %H:%M:%S")

        klines = self.client.get_historical_klines(
            symbol.upper(),
            timeframe,
            start_str,
            end_str
        )

        return klines

    def get_default_fee_rate(self) -> float:
        # Binance spot default taker fee
        return 0.001