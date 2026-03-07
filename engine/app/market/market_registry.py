from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Deque, Dict, Optional, Set, Tuple


MarketCallback = Callable[[Dict[str, float]], Awaitable[None]]
StreamKey = Tuple[str, str]


@dataclass
class StreamState:
    exchange: str
    symbol: str
    subscribers: Set[str] = field(default_factory=set)
    callbacks: Dict[str, MarketCallback] = field(default_factory=dict)
    history: Deque[Dict[str, float]] = field(default_factory=lambda: deque(maxlen=50_000))
    current_candle: Optional[Dict[str, float]] = None
    task: Optional[asyncio.Task] = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    client: Any = None


class MarketRegistry:
    def __init__(self) -> None:
        self._streams: Dict[StreamKey, StreamState] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(self, exchange: str, symbol: str) -> StreamState:
        key = (exchange.lower(), symbol.upper())
        async with self._lock:
            state = self._streams.get(key)
            if state is None:
                state = StreamState(exchange=key[0], symbol=key[1])
                self._streams[key] = state
            return state

    async def get(self, exchange: str, symbol: str) -> Optional[StreamState]:
        key = (exchange.lower(), symbol.upper())
        async with self._lock:
            return self._streams.get(key)

    async def remove_if_empty(self, exchange: str, symbol: str) -> None:
        key = (exchange.lower(), symbol.upper())
        async with self._lock:
            state = self._streams.get(key)
            if state and len(state.subscribers) == 0:
                self._streams.pop(key, None)

    async def all_states(self) -> list[StreamState]:
        async with self._lock:
            return list(self._streams.values())
