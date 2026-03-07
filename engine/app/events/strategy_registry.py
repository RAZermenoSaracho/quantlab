from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Dict, List, Tuple


StrategyCallback = Callable[[Dict[str, float]], Awaitable[None]]
PairKey = Tuple[str, str]


class StrategyRegistry:
    def __init__(self) -> None:
        self._strategies: Dict[PairKey, Dict[str, StrategyCallback]] = {}
        self._lock = asyncio.Lock()

    async def register_strategy(
        self,
        exchange: str,
        symbol: str,
        strategy_id: str,
        callback: StrategyCallback,
    ) -> None:
        key = (exchange.lower(), symbol.upper())
        async with self._lock:
            callbacks = self._strategies.get(key)
            if callbacks is None:
                callbacks = {}
                self._strategies[key] = callbacks
            callbacks[strategy_id] = callback

    async def unregister_strategy(
        self,
        exchange: str,
        symbol: str,
        strategy_id: str,
    ) -> None:
        key = (exchange.lower(), symbol.upper())
        async with self._lock:
            callbacks = self._strategies.get(key)
            if callbacks is None:
                return
            callbacks.pop(strategy_id, None)
            if not callbacks:
                self._strategies.pop(key, None)

    async def get_strategies(
        self,
        exchange: str,
        symbol: str,
    ) -> List[Tuple[str, StrategyCallback]]:
        key = (exchange.lower(), symbol.upper())
        async with self._lock:
            callbacks = self._strategies.get(key) or {}
            return list(callbacks.items())


_STRATEGY_REGISTRY: StrategyRegistry | None = None


def get_strategy_registry() -> StrategyRegistry:
    global _STRATEGY_REGISTRY
    if _STRATEGY_REGISTRY is None:
        _STRATEGY_REGISTRY = StrategyRegistry()
    return _STRATEGY_REGISTRY
