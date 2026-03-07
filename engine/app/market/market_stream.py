from __future__ import annotations

import asyncio
import logging
from typing import Dict, List, Optional

from ..clients import ExchangeFactory
from .candle_aggregator import CandleAggregator
from .market_registry import MarketRegistry, StreamState

logger = logging.getLogger("quantlab.market")


class MarketStreamManager:
    def __init__(self) -> None:
        self._registry = MarketRegistry()

    async def subscribe(
        self,
        exchange: str,
        symbol: str,
        subscriber_id: str,
        callback,
    ) -> None:
        state = await self._registry.get_or_create(exchange, symbol)
        async with state.lock:
            state.subscribers.add(subscriber_id)
            state.callbacks[subscriber_id] = callback
            if state.task is None or state.task.done():
                state.task = asyncio.create_task(self._run_stream(state))

    async def unsubscribe(
        self,
        exchange: str,
        symbol: str,
        subscriber_id: str,
    ) -> None:
        state = await self._registry.get(exchange, symbol)
        if not state:
            return

        should_stop = False
        async with state.lock:
            state.subscribers.discard(subscriber_id)
            state.callbacks.pop(subscriber_id, None)
            should_stop = len(state.subscribers) == 0

        if should_stop:
            await self._stop_state(state)
            await self._registry.remove_if_empty(exchange, symbol)

    async def get_history(
        self,
        exchange: str,
        symbol: str,
        limit: int = 500,
    ) -> List[Dict[str, float]]:
        state = await self._registry.get(exchange, symbol)
        if not state:
            return []
        safe_limit = max(1, min(int(limit), 50_000))
        return list(state.history)[-safe_limit:]

    async def stop_all(self) -> None:
        states = await self._registry.all_states()
        for state in states:
            await self._stop_state(state)

    async def _stop_state(self, state: StreamState) -> None:
        try:
            if state.client is not None:
                await state.client.close_stream()
        except Exception:
            logger.exception(
                "[MarketStream][%s:%s] Failed to close stream client.",
                state.exchange,
                state.symbol,
            )

        if state.task and not state.task.done():
            state.task.cancel()
            try:
                await asyncio.wait_for(state.task, timeout=3.0)
            except Exception:
                logger.exception(
                    "[MarketStream][%s:%s] Failed stopping stream task cleanly.",
                    state.exchange,
                    state.symbol,
                )

        state.task = None
        state.client = None

    async def _dispatch_candle(self, state: StreamState, candle: Dict[str, float]) -> None:
        state.current_candle = candle
        state.history.append(candle)
        callbacks = list(state.callbacks.values())
        if not callbacks:
            return
        await asyncio.gather(*(cb(candle) for cb in callbacks), return_exceptions=True)

    async def _run_stream(self, state: StreamState) -> None:
        try:
            client = ExchangeFactory.create(exchange=state.exchange)
            state.client = client
            aggregator = CandleAggregator("1s")

            async def on_trade(trade: Dict[str, float]) -> None:
                closed = aggregator.add_trade(
                    price=float(trade["price"]),
                    qty=float(trade["qty"]),
                    timestamp_ms=int(trade["timestamp"]),
                )
                for candle in closed:
                    await self._dispatch_candle(state, candle)

            subscribe_trades = getattr(client, "subscribe_trades", None)
            if not callable(subscribe_trades):
                raise RuntimeError(f"Exchange '{state.exchange}' does not support trade streams.")

            logger.info("[MarketStream][%s:%s] stream starting", state.exchange, state.symbol)
            await subscribe_trades(
                symbol=state.symbol,
                on_message=on_trade,
                run_id=f"market:{state.exchange}:{state.symbol}",
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "[MarketStream][%s:%s] stream crashed",
                state.exchange,
                state.symbol,
            )
        finally:
            logger.info("[MarketStream][%s:%s] stream stopped", state.exchange, state.symbol)


_MARKET_STREAM_MANAGER: Optional[MarketStreamManager] = None


def get_market_stream_manager() -> MarketStreamManager:
    global _MARKET_STREAM_MANAGER
    if _MARKET_STREAM_MANAGER is None:
        _MARKET_STREAM_MANAGER = MarketStreamManager()
    return _MARKET_STREAM_MANAGER
