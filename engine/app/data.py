from typing import Optional

from .clients import ExchangeFactory
from .clients.base import BaseExchangeClient


def get_exchange_client(
    exchange: str,
    api_key: Optional[str] = None,
    api_secret: Optional[str] = None,
    testnet: bool = False
) -> BaseExchangeClient:
    """
    Creates and returns an exchange client instance.
    """
    return ExchangeFactory.create(
        exchange=exchange,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet
    )


def fetch_candles(
    exchange: str,
    symbol: str,
    timeframe: str,
    start_date: str,
    end_date: str,
    api_key: Optional[str] = None,
    api_secret: Optional[str] = None,
    testnet: bool = False
):
    """
    Fetch historical candles from any supported exchange.
    """

    client = get_exchange_client(
        exchange=exchange,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet
    )

    return client.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
        start_date=start_date,
        end_date=end_date
    )