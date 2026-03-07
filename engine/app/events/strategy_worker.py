from __future__ import annotations

import asyncio
import logging
from typing import Dict, Optional, Set, Tuple

from ..market import get_market_stream_manager
from .event_queue import StrategyEventQueue
from .strategy_registry import StrategyCallback, get_strategy_registry

logger = logging.getLogger("quantlab.events")

PairKey = Tuple[str, str]


class StrategyEventSystem:
    def __init__(self) -> None:
        self._queue = StrategyEventQueue()
        self._workers: list[asyncio.Task] = []
        self._inflight_limit = asyncio.Semaphore(256)
        self._subscribed_pairs: Set[PairKey] = set()
        self._lock = asyncio.Lock()
        self._market = get_market_stream_manager()
        self._registry = get_strategy_registry()

    async def start_workers(self, count: int = 4) -> None:
        if self._workers:
            return
        worker_count = max(1, int(count))
        for index in range(worker_count):
            task = asyncio.create_task(self._worker_loop(index))
            self._workers.append(task)

    async def stop_workers(self) -> None:
        if not self._workers:
            return
        for task in self._workers:
            task.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()

    async def register_strategy(
        self,
        exchange: str,
        symbol: str,
        strategy_id: str,
        callback: StrategyCallback,
    ) -> None:
        key = (exchange.lower(), symbol.upper())
        await self._registry.register_strategy(
            exchange=key[0],
            symbol=key[1],
            strategy_id=strategy_id,
            callback=callback,
        )

        should_subscribe = False
        async with self._lock:
            if key not in self._subscribed_pairs:
                self._subscribed_pairs.add(key)
                should_subscribe = True

        if should_subscribe:
            async def on_candle(candle: Dict[str, float], pair: PairKey = key) -> None:
                await self.dispatch_pair(pair[0], pair[1], candle)

            await self._market.subscribe(
                exchange=key[0],
                symbol=key[1],
                subscriber_id=f"events:{key[0]}:{key[1]}",
                callback=on_candle,
            )

    async def unregister_strategy(
        self,
        exchange: str,
        symbol: str,
        strategy_id: str,
    ) -> None:
        key = (exchange.lower(), symbol.upper())
        await self._registry.unregister_strategy(
            exchange=key[0],
            symbol=key[1],
            strategy_id=strategy_id,
        )

        strategies = await self._registry.get_strategies(key[0], key[1])
        if strategies:
            return

        should_unsubscribe = False
        async with self._lock:
            if key in self._subscribed_pairs:
                self._subscribed_pairs.remove(key)
                should_unsubscribe = True

        if should_unsubscribe:
            await self._market.unsubscribe(
                exchange=key[0],
                symbol=key[1],
                subscriber_id=f"events:{key[0]}:{key[1]}",
            )

    async def get_history(self, exchange: str, symbol: str, limit: int) -> list[Dict[str, float]]:
        return await self._market.get_history(exchange=exchange, symbol=symbol, limit=limit)

    async def dispatch_pair(self, exchange: str, symbol: str, candle: Dict[str, float]) -> None:
        strategies = await self._registry.get_strategies(exchange, symbol)
        if not strategies:
            return

        for strategy_id, callback in strategies:
            if self._inflight_limit.locked():
                await self._queue.put_dispatch(strategy_id, callback, candle)
                continue
            self._launch_callback(strategy_id, callback, candle)

    def _launch_callback(
        self,
        strategy_id: str,
        callback: StrategyCallback,
        candle: Dict[str, float],
    ) -> None:
        async def _run() -> None:
            await self._inflight_limit.acquire()
            try:
                await callback(candle)
            except Exception:
                logger.exception("[StrategyDispatch] callback failed strategy=%s", strategy_id)
            finally:
                self._inflight_limit.release()

        asyncio.create_task(_run())

    async def _worker_loop(self, worker_index: int) -> None:
        logger.info("[StrategyWorker:%s] started", worker_index)
        while True:
            event = await self._queue.get()
            try:
                if event["type"] != "dispatch":
                    continue
                self._launch_callback(
                    strategy_id=event["strategy_id"],
                    callback=event["callback"],
                    candle=event["candle"],
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("[StrategyWorker:%s] dispatch-buffer processing failed", worker_index)
            finally:
                self._queue.task_done()


_STRATEGY_EVENT_SYSTEM: Optional[StrategyEventSystem] = None


def get_strategy_event_system() -> StrategyEventSystem:
    global _STRATEGY_EVENT_SYSTEM
    if _STRATEGY_EVENT_SYSTEM is None:
        _STRATEGY_EVENT_SYSTEM = StrategyEventSystem()
    return _STRATEGY_EVENT_SYSTEM
