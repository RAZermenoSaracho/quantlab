from abc import ABC, abstractmethod
from typing import List, Any, Dict, Optional


class BaseExchangeClient(ABC):

    # ==========================================================
    # MARKET DATA
    # ==========================================================

    @abstractmethod
    def fetch_candles(
        self,
        symbol: str,
        timeframe: str,
        start_date: str,
        end_date: str
    ) -> List[Any]:
        pass

    @abstractmethod
    def get_latest_price(self, symbol: str) -> float:
        pass

    @abstractmethod
    def get_klines(
        self,
        symbol: str,
        interval: str,
        limit: int = 500
    ) -> List[Any]:
        pass

    @abstractmethod
    def get_order_book(
        self,
        symbol: str,
        limit: int = 100
    ) -> Dict:
        pass

    # ==========================================================
    # EXCHANGE INFO
    # ==========================================================

    @abstractmethod
    def get_symbol_info(self, symbol: str) -> Dict:
        pass

    @abstractmethod
    def get_lot_size(self, symbol: str) -> Optional[float]:
        pass

    @abstractmethod
    def get_tick_size(self, symbol: str) -> Optional[float]:
        pass

    @abstractmethod
    def get_min_notional(self, symbol: str) -> Optional[float]:
        pass

    # ==========================================================
    # ACCOUNT
    # ==========================================================

    @abstractmethod
    def get_account(self) -> Dict:
        pass

    @abstractmethod
    def get_asset_balance(self, asset: str) -> Dict:
        pass

    @abstractmethod
    def get_open_orders(self, symbol: Optional[str] = None) -> List[Dict]:
        pass

    # ==========================================================
    # TRADING
    # ==========================================================

    @abstractmethod
    def create_market_order(
        self,
        symbol: str,
        side: str,
        quantity: float
    ) -> Dict:
        pass

    @abstractmethod
    def create_limit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float
    ) -> Dict:
        pass

    @abstractmethod
    def cancel_order(
        self,
        symbol: str,
        order_id: int
    ) -> Dict:
        pass

    @abstractmethod
    def get_order_status(
        self,
        symbol: str,
        order_id: int
    ) -> Dict:
        pass

    # ==========================================================
    # FEES
    # ==========================================================

    @abstractmethod
    def get_default_fee_rate(self) -> float:
        pass