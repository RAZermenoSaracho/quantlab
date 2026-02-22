import requests
from datetime import datetime
from typing import List, Any

from .base import BaseExchangeClient


BINANCE_BASE_URL = "https://api.binance.com"


class BinanceClient(BaseExchangeClient):

    def fetch_candles(
        self,
        symbol: str,
        timeframe: str,
        start_date: str,
        end_date: str
    ) -> List[Any]:

        start_ts = int(datetime.fromisoformat(start_date).timestamp() * 1000)
        end_ts = int(datetime.fromisoformat(end_date).timestamp() * 1000)

        params = {
            "symbol": symbol.upper(),
            "interval": timeframe,
            "startTime": start_ts,
            "endTime": end_ts,
            "limit": 1000
        }

        response = requests.get(
            f"{BINANCE_BASE_URL}/api/v3/klines",
            params=params,
            timeout=10
        )

        if response.status_code != 200:
            raise Exception(f"Binance API error: {response.text}")

        return response.json()

    def get_default_fee_rate(self) -> float:
        # Spot default (taker)
        return 0.001
