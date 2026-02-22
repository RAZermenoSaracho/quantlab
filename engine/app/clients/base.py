from abc import ABC, abstractmethod
from typing import List, Any


class BaseExchangeClient(ABC):

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
    def get_default_fee_rate(self) -> float:
        pass
