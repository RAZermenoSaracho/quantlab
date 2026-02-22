from .binance_client import BinanceClient


def get_exchange_client(exchange: str):

    exchange = exchange.lower()

    if exchange == "binance":
        return BinanceClient()

    raise Exception(f"Unsupported exchange: {exchange}")
