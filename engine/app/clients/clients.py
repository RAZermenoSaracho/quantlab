from typing import Optional
from .exchanges import BinanceClient
from .base import BaseExchangeClient


class ExchangeFactory:

    @staticmethod
    def create(
        exchange: str,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        testnet: bool = False
    ) -> BaseExchangeClient:

        exchange = exchange.lower()

        if exchange == "binance":
            return BinanceClient(
                api_key=api_key,
                api_secret=api_secret,
                testnet=testnet
            )

        raise ValueError(f"Unsupported exchange: {exchange}")