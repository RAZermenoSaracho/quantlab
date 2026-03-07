from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Dict, TypedDict


StrategyCallback = Callable[[Dict[str, float]], Awaitable[None]]


class DispatchEvent(TypedDict):
    type: str
    strategy_id: str
    callback: StrategyCallback
    candle: Dict[str, float]


class StrategyEventQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[DispatchEvent] = asyncio.Queue()

    async def put_dispatch(
        self,
        strategy_id: str,
        callback: StrategyCallback,
        candle: Dict[str, float],
    ) -> None:
        await self._queue.put(
            DispatchEvent(
                type="dispatch",
                strategy_id=strategy_id,
                callback=callback,
                candle=candle,
            )
        )

    async def get(self) -> DispatchEvent:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    async def join(self) -> None:
        await self._queue.join()
