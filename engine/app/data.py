from .clients import get_exchange_client


def fetch_candles(
    exchange: str,
    symbol: str,
    timeframe: str,
    start_date: str,
    end_date: str
):
    client = get_exchange_client(exchange)

    return client.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
        start_date=start_date,
        end_date=end_date
    )
