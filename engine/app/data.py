# engine/app/data.py

import requests
from datetime import datetime

BINANCE_BASE_URL = "https://api.binance.com"


def fetch_candles(
    symbol: str,
    timeframe: str,
    start_date: str,
    end_date: str
):
    """
    Fetch historical candles from Binance.
    """

    # Convert ISO string → milliseconds
    start_ts = int(datetime.fromisoformat(start_date).timestamp() * 1000)
    end_ts = int(datetime.fromisoformat(end_date).timestamp() * 1000)

    params = {
        "symbol": symbol.upper(),
        "interval": timeframe,
        "startTime": start_ts,
        "endTime": end_ts,
        "limit": 1000  # Binance max per request
    }

    response = requests.get(
        f"{BINANCE_BASE_URL}/api/v3/klines",
        params=params,
        timeout=10
    )

    if response.status_code != 200:
        raise Exception(f"Binance API error: {response.text}")

    return response.json()
