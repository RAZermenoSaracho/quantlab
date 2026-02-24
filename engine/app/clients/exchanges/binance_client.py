from datetime import datetime
from typing import List, Any, Dict, Optional

from binance.client import Client

from ..base import BaseExchangeClient


class BinanceClient(BaseExchangeClient):

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        testnet: bool = False
    ):
        """
        If no api_key/api_secret provided:
            -> Only public market data available.

        If api_key/api_secret provided:
            -> Enables private endpoints (account, trading).

        If testnet=True:
            -> Connects to Binance Spot Testnet.
        """
        self.client = Client(api_key, api_secret)

        if testnet:
            self.client.API_URL = "https://testnet.binance.vision/api"

        self.testnet = testnet
        self.api_enabled = api_key is not None and api_secret is not None

    # ==========================================================
    # EXISTING METHODS (UNCHANGED)
    # ==========================================================

    def fetch_candles(
        self,
        symbol: str,
        timeframe: str,
        start_date: str,
        end_date: str
    ) -> List[Any]:

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
        return 0.001  # 0.1%

    # ==========================================================
    # MARKET DATA
    # ==========================================================

    def get_latest_price(self, symbol: str) -> float:
        ticker = self.client.get_symbol_ticker(symbol=symbol.upper())
        return float(ticker["price"])

    def get_klines(
        self,
        symbol: str,
        interval: str,
        limit: int = 500
    ) -> List[Any]:
        return self.client.get_klines(
            symbol=symbol.upper(),
            interval=interval,
            limit=limit
        )

    def get_order_book(
        self,
        symbol: str,
        limit: int = 100
    ) -> Dict:
        return self.client.get_order_book(
            symbol=symbol.upper(),
            limit=limit
        )

    def get_recent_trades(
        self,
        symbol: str,
        limit: int = 500
    ) -> List[Dict]:
        return self.client.get_recent_trades(
            symbol=symbol.upper(),
            limit=limit
        )

    # ==========================================================
    # EXCHANGE INFO
    # ==========================================================

    def get_exchange_info(self) -> Dict:
        return self.client.get_exchange_info()

    def get_symbol_info(self, symbol: str) -> Dict:
        return self.client.get_symbol_info(symbol.upper())

    def get_lot_size(self, symbol: str) -> Optional[float]:
        info = self.get_symbol_info(symbol)
        if not info:
            return None

        for f in info["filters"]:
            if f["filterType"] == "LOT_SIZE":
                return float(f["stepSize"])
        return None

    def get_tick_size(self, symbol: str) -> Optional[float]:
        info = self.get_symbol_info(symbol)
        if not info:
            return None

        for f in info["filters"]:
            if f["filterType"] == "PRICE_FILTER":
                return float(f["tickSize"])
        return None

    def get_min_notional(self, symbol: str) -> Optional[float]:
        info = self.get_symbol_info(symbol)
        if not info:
            return None

        for f in info["filters"]:
            if f["filterType"] == "MIN_NOTIONAL":
                return float(f["minNotional"])
        return None

    # ==========================================================
    # ACCOUNT (PRIVATE ENDPOINTS)
    # ==========================================================

    def _ensure_api_enabled(self):
        if not self.api_enabled:
            raise Exception("API key and secret required for private endpoints.")

    def get_account(self) -> Dict:
        self._ensure_api_enabled()
        return self.client.get_account()

    def get_asset_balance(self, asset: str) -> Dict:
        self._ensure_api_enabled()
        return self.client.get_asset_balance(asset=asset.upper())

    def get_open_orders(self, symbol: Optional[str] = None) -> List[Dict]:
        self._ensure_api_enabled()
        if symbol:
            return self.client.get_open_orders(symbol=symbol.upper())
        return self.client.get_open_orders()

    # ==========================================================
    # TRADING (LIVE OR TESTNET)
    # ==========================================================

    def create_market_order(
        self,
        symbol: str,
        side: str,
        quantity: float
    ) -> Dict:
        self._ensure_api_enabled()
        return self.client.create_order(
            symbol=symbol.upper(),
            side=side.upper(),
            type=Client.ORDER_TYPE_MARKET,
            quantity=quantity
        )

    def create_limit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
        time_in_force: str = Client.TIME_IN_FORCE_GTC
    ) -> Dict:
        self._ensure_api_enabled()
        return self.client.create_order(
            symbol=symbol.upper(),
            side=side.upper(),
            type=Client.ORDER_TYPE_LIMIT,
            timeInForce=time_in_force,
            quantity=quantity,
            price=str(price)
        )

    def cancel_order(
        self,
        symbol: str,
        order_id: int
    ) -> Dict:
        self._ensure_api_enabled()
        return self.client.cancel_order(
            symbol=symbol.upper(),
            orderId=order_id
        )

    def get_order_status(
        self,
        symbol: str,
        order_id: int
    ) -> Dict:
        self._ensure_api_enabled()
        return self.client.get_order(
            symbol=symbol.upper(),
            orderId=order_id
        )

    # ==========================================================
    # FEES
    # ==========================================================

    def get_trade_fee(self, symbol: Optional[str] = None) -> Any:
        self._ensure_api_enabled()
        if symbol:
            return self.client.get_trade_fee(symbol=symbol.upper())
        return self.client.get_trade_fee()