import asyncio
import logging
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

from binance.client import Client
from binance import AsyncClient, BinanceSocketManager

from ..base import BaseExchangeClient

logger = logging.getLogger("quantlab.exchange.binance")


class BinanceClient(BaseExchangeClient):
    def __init__(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        testnet: bool = False,
    ):
        # Sync REST
        self.client = Client(api_key, api_secret)
        if testnet:
            self.client.API_URL = "https://testnet.binance.vision/api"

        self.testnet = testnet
        self.api_enabled = api_key is not None and api_secret is not None

        # Async WS
        self._async_client: Optional[AsyncClient] = None
        self._socket_manager: Optional[BinanceSocketManager] = None
        self._stream_active = False
        self._max_inflight_callbacks = 2000

    # ==========================================================
    # STREAMING
    # ==========================================================

    async def _ensure_async_client(self) -> None:
        if self._async_client is None:
            self._async_client = await AsyncClient.create(
                api_key=None,
                api_secret=None,
                testnet=self.testnet,
            )
            self._socket_manager = BinanceSocketManager(self._async_client)

    async def _reset_async_stream_client(self) -> None:
        if self._async_client is not None:
            try:
                await self._async_client.close_connection()
            except Exception:
                logger.exception("Failed to close async Binance client during reset.")
        self._async_client = None
        self._socket_manager = None

    @staticmethod
    def _is_read_loop_closed_error(err: Exception) -> bool:
        return err.__class__.__name__ == "ReadLoopClosed"

    async def subscribe_klines(
        self,
        symbol: str,
        timeframe: str,
        on_message: Callable[[Dict[str, Any]], Awaitable[None]],
        run_id: Optional[str] = None,
        log_raw: bool = False,
        log_every: int = 25,
    ) -> None:
        """
        Subscribes to Binance kline websocket and calls on_message ONLY on candle close.

        - run_id is optional (used for clearer logs when multiple sessions run concurrently)
        - log_raw prints the raw payload (throttled by log_every)
        """
        await self._ensure_async_client()

        self._stream_active = True

        if not self._socket_manager:
            raise RuntimeError("BinanceSocketManager not initialized")

        rid = run_id or "unknown"
        sym = symbol.upper()

        socket = self._socket_manager.kline_socket(symbol=sym, interval=timeframe)

        msg_count = 0

        logger.info("[WS][%s] CONNECTING symbol=%s timeframe=%s testnet=%s", rid, sym, timeframe, self.testnet)

        inflight_tasks: set[asyncio.Task[Any]] = set()

        async def _drain_inflight() -> None:
            if not inflight_tasks:
                return
            done, _ = await asyncio.wait(inflight_tasks, timeout=0, return_when=asyncio.ALL_COMPLETED)
            for task in done:
                inflight_tasks.discard(task)

        async with socket as stream:
            logger.info("[WS][%s] CONNECTED symbol=%s timeframe=%s", rid, sym, timeframe)

            while self._stream_active:
                try:
                    msg = await stream.recv()
                    msg_count += 1

                    if not msg:
                        continue

                    # Optional raw payload logging (throttled)
                    if log_raw and (msg_count % max(1, log_every) == 0):
                        logger.info("[WS][%s] RAW(%s): %s", rid, msg_count, msg)

                    # Binance sometimes sends error/close events or non-kline messages
                    if not isinstance(msg, dict):
                        continue

                    # Typical kline message contains "k"
                    k = msg.get("k")
                    if not isinstance(k, dict):
                        # Some messages may contain keys like "close" or other event types
                        # We ignore them safely.
                        continue

                    # Only process closed candles (no partial candle spam)
                    if not k.get("x", False):
                        continue

                    # Defensive parsing
                    required = ("o", "h", "l", "c", "v", "t")
                    if not all(key in k for key in required):
                        logger.warning("[WS][%s] INVALID_KLINE keys=%s k=%s", rid, list(k.keys()), k)
                        continue

                    candle = {
                        "open": float(k["o"]),
                        "high": float(k["h"]),
                        "low": float(k["l"]),
                        "close": float(k["c"]),
                        "volume": float(k["v"]),
                        "timestamp": int(k["t"]),
                    }

                    logger.info(
                        "[WS][%s] CANDLE_CLOSED ts=%s close=%.4f",
                        rid,
                        candle["timestamp"],
                        candle["close"],
                    )

                    if len(inflight_tasks) >= self._max_inflight_callbacks:
                        await _drain_inflight()
                        if len(inflight_tasks) >= self._max_inflight_callbacks:
                            logger.warning("[WS][%s] kline callback backlog=%s; dropping tick", rid, len(inflight_tasks))
                            continue

                    task = asyncio.create_task(on_message(candle))
                    inflight_tasks.add(task)
                    task.add_done_callback(lambda t: inflight_tasks.discard(t))

                except asyncio.CancelledError:
                    logger.info("[WS][%s] CancelledError - exiting websocket loop.", rid)
                    break
                except Exception:
                    # Don’t kill the session on transient WS issues; keep listening.
                    logger.exception("[WS][%s] WebSocket receive/parse error (continuing).", rid)
                    await asyncio.sleep(0.25)
                    continue

        logger.info("[WS][%s] Websocket context exited symbol=%s timeframe=%s", rid, sym, timeframe)
        if inflight_tasks:
            await asyncio.gather(*inflight_tasks, return_exceptions=True)

    async def subscribe_trades(
        self,
        symbol: str,
        on_message: Callable[[Dict[str, Any]], Awaitable[None]],
        run_id: Optional[str] = None,
        log_raw: bool = False,
        log_every: int = 100,
    ) -> None:
        """
        Subscribes to Binance trade websocket and calls on_message for every trade.
        """
        self._stream_active = True

        rid = run_id or "unknown"
        sym = symbol.upper()
        msg_count = 0

        inflight_tasks: set[asyncio.Task[Any]] = set()

        async def _drain_inflight() -> None:
            if not inflight_tasks:
                return
            done, _ = await asyncio.wait(inflight_tasks, timeout=0, return_when=asyncio.ALL_COMPLETED)
            for task in done:
                inflight_tasks.discard(task)

        while self._stream_active:
            try:
                await self._ensure_async_client()

                if not self._socket_manager:
                    raise RuntimeError("BinanceSocketManager not initialized")

                logger.info("[WS][%s] CONNECTING trades symbol=%s testnet=%s", rid, sym, self.testnet)
                socket = self._socket_manager.trade_socket(symbol=sym)

                async with socket as stream:
                    logger.info("[WS][%s] CONNECTED trades symbol=%s", rid, sym)

                    while self._stream_active:
                        msg = await stream.recv()
                        msg_count += 1

                        if not msg:
                            continue

                        if log_raw and (msg_count % max(1, log_every) == 0):
                            logger.info("[WS][%s] TRADE_RAW(%s): %s", rid, msg_count, msg)

                        if not isinstance(msg, dict):
                            continue

                        if msg.get("e") != "trade":
                            continue

                        if "p" not in msg or "q" not in msg or "T" not in msg:
                            continue

                        trade = {
                            "price": float(msg["p"]),
                            "qty": float(msg["q"]),
                            "timestamp": int(msg["T"]),
                        }
                        if len(inflight_tasks) >= self._max_inflight_callbacks:
                            await _drain_inflight()
                            if len(inflight_tasks) >= self._max_inflight_callbacks:
                                logger.warning("[WS][%s] trade callback backlog=%s; dropping trade", rid, len(inflight_tasks))
                                continue

                        task = asyncio.create_task(on_message(trade))
                        inflight_tasks.add(task)
                        task.add_done_callback(lambda t: inflight_tasks.discard(t))

                if self._stream_active:
                    logger.warning("[WS][%s] WS CLOSED trades symbol=%s", rid, sym)
                    logger.info("[WS][%s] WS RECONNECTING trades symbol=%s", rid, sym)
                    await self._reset_async_stream_client()
                    try:
                        await asyncio.sleep(1)
                    except asyncio.CancelledError:
                        logger.info("[WS][%s] Trade stream cancelled during reconnect backoff.", rid)
                        break

            except asyncio.CancelledError:
                logger.info("[WS][%s] Trade stream cancelled.", rid)
                break
            except Exception as err:
                if not self._stream_active:
                    break

                if self._is_read_loop_closed_error(err):
                    logger.warning(
                        "[WS][%s] WS CLOSED trades symbol=%s (ReadLoopClosed).",
                        rid,
                        sym,
                    )
                elif "BinanceWebsocketQueueOverflow" in err.__class__.__name__:
                    logger.warning(
                        "[WS][%s] WS queue overflow symbol=%s; resetting websocket.",
                        rid,
                        sym,
                    )
                else:
                    logger.exception("[WS][%s] Trade stream error.", rid)

                logger.info("[WS][%s] WS RECONNECTING trades symbol=%s", rid, sym)
                await self._reset_async_stream_client()
                try:
                    await asyncio.sleep(1)
                except asyncio.CancelledError:
                    logger.info("[WS][%s] Trade stream cancelled during error backoff.", rid)
                    break

        logger.info("[WS][%s] Trade websocket loop stopped symbol=%s", rid, sym)
        if inflight_tasks:
            await asyncio.gather(*inflight_tasks, return_exceptions=True)

    async def close_stream(self) -> None:
        self._stream_active = False

        if self._async_client:
            try:
                await self._async_client.close_connection()
            finally:
                self._async_client = None
                self._socket_manager = None

    # ==========================================================
    # REST METHODS (UNCHANGED)
    # ==========================================================

    def fetch_candles(self, symbol: str, timeframe: str, start_date: str, end_date: str) -> List[Any]:
        start_str = datetime.fromisoformat(start_date).strftime("%d %b, %Y %H:%M:%S")
        end_str = datetime.fromisoformat(end_date).strftime("%d %b, %Y %H:%M:%S")
        return self.client.get_historical_klines(symbol.upper(), timeframe, start_str, end_str)

    def get_default_fee_rate(self) -> float:
        return 0.001

    def get_latest_price(self, symbol: str) -> float:
        ticker = self.client.get_symbol_ticker(symbol=symbol.upper())
        return float(ticker["price"])

    def get_klines(self, symbol: str, interval: str, limit: int = 500) -> List[Any]:
        return self.client.get_klines(symbol=symbol.upper(), interval=interval, limit=limit)

    def get_order_book(self, symbol: str, limit: int = 100) -> Dict:
        return self.client.get_order_book(symbol=symbol.upper(), limit=limit)

    def get_recent_trades(self, symbol: str, limit: int = 500) -> List[Dict]:
        return self.client.get_recent_trades(symbol=symbol.upper(), limit=limit)

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

    def _ensure_api_enabled(self) -> None:
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

    def create_market_order(self, symbol: str, side: str, quantity: float) -> Dict:
        self._ensure_api_enabled()
        return self.client.create_order(
            symbol=symbol.upper(),
            side=side.upper(),
            type=Client.ORDER_TYPE_MARKET,
            quantity=quantity,
        )

    def create_limit_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
        time_in_force: str = Client.TIME_IN_FORCE_GTC,
    ) -> Dict:
        self._ensure_api_enabled()
        return self.client.create_order(
            symbol=symbol.upper(),
            side=side.upper(),
            type=Client.ORDER_TYPE_LIMIT,
            timeInForce=time_in_force,
            quantity=quantity,
            price=str(price),
        )

    def cancel_order(self, symbol: str, order_id: int) -> Dict:
        self._ensure_api_enabled()
        return self.client.cancel_order(symbol=symbol.upper(), orderId=order_id)

    def get_order_status(self, symbol: str, order_id: int) -> Dict:
        self._ensure_api_enabled()
        return self.client.get_order(symbol=symbol.upper(), orderId=order_id)

    def get_trade_fee(self, symbol: Optional[str] = None) -> Any:
        self._ensure_api_enabled()
        if symbol:
            return self.client.get_trade_fee(symbol=symbol.upper())
        return self.client.get_trade_fee()
