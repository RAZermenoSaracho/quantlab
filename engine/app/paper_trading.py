import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx

from .clients import ExchangeFactory
from .context import build_context
from .data.candle_aggregator import expand_minute_candles_to_subminute
from .execution import FixedBpsSlippage
from .events import get_strategy_event_system
from .indicators import compute_indicator_series
from .market import CandleResampler, timeframe_to_ms
from .portfolio import PortfolioEngine
from .spec import load_config_from_env
from .validator import SAFE_GLOBALS

logger = logging.getLogger("quantlab.paper")

# ======================================================
# CONFIGURATION
# ======================================================

BACKEND_BASE_URL = os.getenv("BACKEND_URL", "http://localhost:5000").rstrip("/")
BACKEND_EVENT_URL = f"{BACKEND_BASE_URL}/api/paper/internal/event"

_HTTP_TIMEOUT = httpx.Timeout(connect=5.0, read=5.0, write=5.0, pool=5.0)
_http_client: Optional[httpx.AsyncClient] = None

# Strategy safety: do not crash paper stream on strategy exceptions
_STRATEGY_CRASH_IS_FATAL = os.getenv("PAPER_STRATEGY_FATAL", "0") == "1"

_MAX_ENGINE_TICKS_PER_SECOND = 10.0
_TARGET_HYDRATION_CANDLES = 500
_MAX_STORED_CANDLES = 10_000


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
    return _http_client


async def close_http_client() -> None:
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
    _http_client = None


# ======================================================
# EVENT EMITTER
# ======================================================

async def emit_event(run_id: str, event_type: str, payload: Dict[str, Any]) -> None:
    """
    Sends an event to the backend (DB persistence + websocket broadcast).
    """
    event_data = {
        "run_id": run_id,
        "event_type": event_type,
        "payload": payload,
    }

    try:
        client = _get_http_client()
        resp = await client.post(BACKEND_EVENT_URL, json=event_data)

        if resp.status_code >= 400:
            logger.error(
                "[PaperTrading][%s] Backend rejected event=%s status=%s body=%s",
                run_id,
                event_type,
                resp.status_code,
                resp.text[:300],
            )
    except Exception as e:
        logger.error("[PaperTrading][%s] Failed to emit event=%s err=%s", run_id, event_type, e)


# ======================================================
# CONTEXT ADAPTER (BACKWARD COMPAT)
# ======================================================

def _adapt_context_for_strategies(ctx: Dict[str, Any]) -> Dict[str, Any]:
    """
    Your canonical context is:
      {
        "candle": {...},
        "history": (...),
        "indicators": {...},
        ...
      }

    But some strategies may do ctx["close"] instead of ctx["candle"]["close"].
    To prevent random KeyError crashes, we keep the canonical structure and ALSO
    inject top-level candle keys for backward compatibility.
    """
    candle = ctx.get("candle") or {}
    if isinstance(candle, dict):
        for k in ("open", "high", "low", "close", "volume", "timestamp"):
            if k in candle and k not in ctx:
                ctx[k] = candle[k]
    return ctx


def _safe_intent(raw_signal: Any) -> str:
    if raw_signal is None:
        return "HOLD"
    return str(raw_signal).upper().strip()


def _normalize_signal(raw_signal: Any) -> str:
    if raw_signal is None:
        return "HOLD"
    s = str(raw_signal).upper().strip()
    if s in {"LONG", "BUY"}:
        return "BUY"
    if s in {"SHORT", "SELL", "CLOSE"}:
        return "SELL"
    return "HOLD"


def _normalize_order_instruction(raw_signal: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_signal, dict):
        return None

    action = str(raw_signal.get("action", "")).upper().strip()
    if action not in ("BUY", "SELL", "CLOSE", "HOLD"):
        return None
    if action == "HOLD":
        return None

    order_type = str(raw_signal.get("order_type", "market")).lower().strip()
    if order_type not in ("market", "limit", "stop", "stop_limit"):
        order_type = "market"

    return {
        "action": action,
        "order_type": order_type,
        "price": raw_signal.get("price"),
        "stop_price": raw_signal.get("stop_price"),
        "size_pct": raw_signal.get("size_pct"),
        "quantity": raw_signal.get("quantity"),
        "reduce_only": bool(raw_signal.get("reduce_only", action in ("SELL", "CLOSE"))),
    }


# ======================================================
# PAPER SESSION
# ======================================================

class PaperSession:
    """
    One paper trading session (many can run simultaneously).
    """

    def __init__(self, request):
        self.run_id = request.run_id
        self.exchange = request.exchange
        raw_symbols = getattr(request, "symbols", None)
        if raw_symbols and isinstance(raw_symbols, list):
            parsed_symbols = [str(item).upper() for item in raw_symbols if str(item).strip()]
        else:
            parsed_symbols = [
                part.strip().upper()
                for part in str(request.symbol).split(",")
                if part.strip()
            ]
        if not parsed_symbols:
            parsed_symbols = [str(request.symbol).upper()]

        seen: set[str] = set()
        self.symbols: List[str] = []
        for item in parsed_symbols:
            if item not in seen:
                seen.add(item)
                self.symbols.append(item)

        self.symbol = self.symbols[0]
        self.primary_symbol = self.symbol
        self.timeframe = request.timeframe

        # Account model (spot-like)
        self.initial_balance = float(request.initial_balance)
        self.quote_balance = float(request.initial_balance)  # e.g. USDT in BTCUSDT
        self.base_balance = 0.0                              # e.g. BTC in BTCUSDT
        self.last_price: Optional[float] = None

        metadata_client = None
        try:
            metadata_client = ExchangeFactory.create(
                exchange=self.exchange,
                api_key=request.api_key,
                api_secret=request.api_secret,
                testnet=request.testnet,
            )
        except Exception:
            logger.exception(
                "[PaperTrading][%s] Failed creating exchange client for metadata.",
                self.run_id,
            )

        if request.fee_rate is not None:
            self.fee_rate = float(request.fee_rate)
        else:
            try:
                if metadata_client is not None:
                    self.fee_rate = float(metadata_client.get_fee_model(self.symbol).taker_fee)
                else:
                    self.fee_rate = 0.001
            except Exception:
                logger.exception(
                    "[PaperTrading][%s] Failed to load exchange fee model; using fallback taker fee.",
                    self.run_id,
                )
                self.fee_rate = 0.001

        self.symbol_lot_sizes: Dict[str, Optional[float]] = {}
        for symbol_item in self.symbols:
            lot_size: Optional[float] = None
            if metadata_client is not None:
                try:
                    raw_lot_size = metadata_client.get_lot_size(symbol_item)
                    if raw_lot_size is not None and float(raw_lot_size) > 0:
                        lot_size = float(raw_lot_size)
                except Exception:
                    logger.warning(
                        "[PaperTrading][%s] Failed to load lot size for %s",
                        self.run_id,
                        symbol_item,
                        exc_info=True,
                    )
            self.symbol_lot_sizes[symbol_item] = lot_size

        self.position: Optional[Dict[str, Any]] = None
        self.positions: Dict[str, Dict[str, Any]] = {}
        self.pending_orders_by_symbol: Dict[str, List[Dict[str, Any]]] = {
            symbol: [] for symbol in self.symbols
        }
        self.pending_orders: List[Dict[str, Any]] = self.pending_orders_by_symbol[self.primary_symbol]
        self.trades: List[Dict[str, Any]] = []
        self.candles_by_symbol: Dict[str, List[Dict[str, Any]]] = {
            symbol: [] for symbol in self.symbols
        }
        self.candles: List[Dict[str, Any]] = self.candles_by_symbol[self.primary_symbol]
        self.last_prices: Dict[str, float] = {}
        self.realized_pnl = 0.0
        self.equity_curve: List[Dict[str, float]] = []
        self.portfolio = PortfolioEngine(initial_cash=self.initial_balance)

        self.active = False
        self._subscriber_id = f"paper:{self.run_id}"
        self._event_system = get_strategy_event_system()
        self._resamplers: Dict[str, CandleResampler] = {}
        self._resampler: Optional[CandleResampler] = None
        self._last_tick_wall_time = 0.0
        self.last_exit_ts: Optional[int] = None
        self.reentry_blocked = False

        # Future live trading credentials (kept for compatibility)
        self.api_key = request.api_key
        self.api_secret = request.api_secret
        self.testnet = request.testnet

        # Compile user algorithm safely
        self.execution_env = dict(SAFE_GLOBALS)
        exec(request.code, self.execution_env, self.execution_env)

        fn = self.execution_env.get("generate_signal")
        if fn is None or not callable(fn):
            raise Exception("generate_signal function not defined or not callable.")

        self.generate_signal = fn

        # Load algorithm CONFIG
        self.config, _raw_cfg = load_config_from_env(self.execution_env)

        # WS debug counters
        self._ws_msg_count = 0
        self._last_ws_heartbeat_log = 0

        logger.info(
            "[PaperTrading][%s] Session created exchange=%s symbols=%s timeframe=%s initial_balance=%.2f fee_rate=%.6f",
            self.run_id,
            self.exchange,
            ",".join(self.symbols),
            self.timeframe,
            self.initial_balance,
            self.fee_rate,
        )

    # ==================================================
    # START / STOP
    # ==================================================

    def _compute_unrealized_pnl(
        self,
        current_price: Optional[float] = None,
        symbol: Optional[str] = None,
    ) -> float:
        if current_price is not None:
            if symbol:
                self.portfolio.apply_price_update_for_symbol(str(symbol), float(current_price))
            else:
                self.portfolio.apply_price_update(float(current_price))
            self._sync_from_portfolio()
        return float(self.portfolio.state.unrealized_pnl)

    def portfolio_state(self) -> Dict[str, Any]:
        self._sync_from_portfolio()
        unrealized = float(self.portfolio.state.unrealized_pnl)
        usdt_balance = float(self.quote_balance)
        btc_balance = max(0.0, float(self.base_balance))
        equity = float(self.portfolio.state.total_equity)
        total_pending_orders = sum(
            len([o for o in orders if str(o.get("status", "pending")) == "pending"])
            for orders in self.pending_orders_by_symbol.values()
        )

        return {
            "run_id": self.run_id,
            "balance": usdt_balance,
            "usdt_balance": usdt_balance,
            "btc_balance": btc_balance,
            "equity": float(equity),
            "realized_pnl": float(self.realized_pnl),
            "unrealized_pnl": float(unrealized),
            "open_positions": int(self.portfolio.open_positions_count()),
            "pending_orders": int(total_pending_orders),
            "trades_count": len(self.trades),
            "equity_curve": list(self.equity_curve),
            "symbols": list(self.symbols),
            "positions": self.positions,
            "last_prices": self.last_prices,
        }

    def _sync_from_portfolio(self) -> None:
        self.positions = self.portfolio.positions_by_symbol()
        position = self.portfolio.position_for_symbol(self.primary_symbol)
        self.position = position
        self.quote_balance = float(self.portfolio.state.cash_balance)
        self.base_balance = float(position["quantity"]) if position else 0.0
        self.realized_pnl = float(self.portfolio.state.realized_pnl)
        self.last_prices = dict(self.portfolio.state.last_prices)
        if self.primary_symbol in self.last_prices:
            self.last_price = float(self.last_prices[self.primary_symbol])
        elif self.portfolio.state.last_price is not None:
            self.last_price = float(self.portfolio.state.last_price)

    def _append_equity_point(self, timestamp: int, equity: Optional[float] = None) -> None:
        self._sync_from_portfolio()
        point_equity = float(
            equity
            if equity is not None
            else float(self.portfolio.state.total_equity)
        )
        point_ts = int(timestamp)

        if self.equity_curve and int(self.equity_curve[-1]["timestamp"]) == point_ts:
            self.equity_curve[-1]["equity"] = point_equity
            return

        self.equity_curve.append({
            "timestamp": point_ts,
            "equity": point_equity,
        })

    async def _emit_portfolio_update(self) -> None:
        await emit_event(self.run_id, "portfolio_update", self.portfolio_state())

    async def start(self) -> None:
        if self.active:
            return

        self.active = True
        await emit_event(self.run_id, "status", {"status": "ACTIVE"})
        start_ts = int(time.time() * 1000)
        self._append_equity_point(start_ts, equity=float(self.initial_balance))
        await self._emit_portfolio_update()

        logger.info(
            "[PaperTrading][%s] START requested. Subscribing to shared market stream exchange=%s symbols=%s timeframe=%s",
            self.run_id,
            self.exchange,
            ",".join(self.symbols),
            self.timeframe,
        )
        await self._hydrate_history()
        for symbol in self.symbols:
            if self.timeframe != "1s":
                self._resamplers[symbol] = CandleResampler(self.timeframe)
            callback = (lambda sym: (lambda candle: self._on_market_candle(sym, candle)))(symbol)
            await self._event_system.register_strategy(
                exchange=self.exchange,
                symbol=symbol,
                strategy_id=f"{self._subscriber_id}:{symbol}",
                callback=callback,
            )

    async def stop(self) -> None:
        if not self.active:
            return

        logger.info("[PaperTrading][%s] STOP requested.", self.run_id)

        self.active = False

        for symbol in self.symbols:
            await self._event_system.unregister_strategy(
                exchange=self.exchange,
                symbol=symbol,
                strategy_id=f"{self._subscriber_id}:{symbol}",
            )

        await emit_event(self.run_id, "status", {"status": "STOPPED"})
        logger.info("[PaperTrading][%s] STOP completed.", self.run_id)

    # ==================================================
    # MARKET STREAM INTEGRATION
    # ==================================================

    @staticmethod
    def _normalize_candle(candle: Dict[str, Any]) -> Dict[str, float]:
        return {
            "timestamp": int(candle["timestamp"]),
            "open": float(candle["open"]),
            "high": float(candle["high"]),
            "low": float(candle["low"]),
            "close": float(candle["close"]),
            "volume": float(candle.get("volume", 0.0)),
        }

    def _merge_candles_by_timestamp(
        self,
        primary: List[Dict[str, Any]],
        secondary: List[Dict[str, Any]],
    ) -> List[Dict[str, float]]:
        merged: Dict[int, Dict[str, float]] = {}

        for candle in primary:
            normalized = self._normalize_candle(candle)
            merged[int(normalized["timestamp"])] = normalized

        for candle in secondary:
            normalized = self._normalize_candle(candle)
            merged[int(normalized["timestamp"])] = normalized

        ordered = sorted(merged.values(), key=lambda item: int(item["timestamp"]))
        return ordered[-_MAX_STORED_CANDLES:]

    async def _fetch_rest_fallback_candles(
        self,
        required_candles: int,
    ) -> List[Dict[str, float]]:
        missing = max(0, int(required_candles))
        if missing <= 0:
            return []

        subminute_timeframes = {"1s", "5s", "15s", "30s"}
        requested_timeframe = str(self.timeframe).lower()
        source_timeframe = "1m" if requested_timeframe in subminute_timeframes else self.timeframe

        try:
            source_ms = timeframe_to_ms(source_timeframe)
        except Exception:
            source_ms = 60_000

        # Add headroom to avoid bucket-edge truncation from exchange API.
        source_needed = max(1, int(missing) + 5)
        if requested_timeframe in subminute_timeframes:
            target_ms = timeframe_to_ms(requested_timeframe)
            expand_ratio = max(1, int(source_ms // target_ms))
            source_needed = max(1, int((missing + 5 + expand_ratio - 1) // expand_ratio) + 2)

        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(milliseconds=source_ms * source_needed)

        try:
            client = ExchangeFactory.create(exchange=self.exchange)
            raw_rows = client.fetch_candles(
                self.symbol,
                source_timeframe,
                start_dt.isoformat(),
                end_dt.isoformat(),
            )
        except Exception:
            logger.exception(
                "[PaperTrading][%s] Failed REST fallback history fetch exchange=%s symbol=%s timeframe=%s",
                self.run_id,
                self.exchange,
                self.symbol,
                self.timeframe,
            )
            return []

        normalized_rows: List[Dict[str, float]] = []
        for row in raw_rows:
            try:
                normalized_rows.append(
                    {
                        "timestamp": int(row[0]),
                        "open": float(row[1]),
                        "high": float(row[2]),
                        "low": float(row[3]),
                        "close": float(row[4]),
                        "volume": float(row[5]),
                    }
                )
            except Exception:
                continue

        if requested_timeframe in subminute_timeframes:
            try:
                normalized_rows = expand_minute_candles_to_subminute(
                    normalized_rows,
                    requested_timeframe,
                )
            except Exception:
                logger.exception(
                    "[PaperTrading][%s] Failed expanding REST minute candles to %s",
                    self.run_id,
                    requested_timeframe,
                )
                return []

        return normalized_rows[-_MAX_STORED_CANDLES:]

    async def _emit_hydrated_candle_history(self, symbol: str, limit: int = _TARGET_HYDRATION_CANDLES) -> None:
        candles = self.candles_by_symbol.get(symbol) or []
        if not candles:
            return

        for candle in candles[-max(1, int(limit)):]:
            await emit_event(
                self.run_id,
                "candle",
                {
                    "symbol": symbol,
                    "timestamp": int(candle["timestamp"]),
                    "open": float(candle["open"]),
                    "high": float(candle["high"]),
                    "low": float(candle["low"]),
                    "close": float(candle["close"]),
                    "volume": float(candle["volume"]),
                },
            )

    async def _hydrate_history(self) -> None:
        for symbol in self.symbols:
            raw_history: List[Dict[str, Any]] = []
            try:
                raw_history = await self._event_system.get_history(
                    exchange=self.exchange,
                    symbol=symbol,
                    limit=50_000,
                )
            except Exception:
                logger.exception("[PaperTrading][%s] Failed loading shared market history symbol=%s.", self.run_id, symbol)
                raw_history = []

            merged_history = self._merge_candles_by_timestamp(raw_history, [])

            if len(merged_history) < _TARGET_HYDRATION_CANDLES:
                original_symbol = self.symbol
                try:
                    self.symbol = symbol
                    fallback_history = await self._fetch_rest_fallback_candles(
                        _TARGET_HYDRATION_CANDLES - len(merged_history)
                    )
                finally:
                    self.symbol = original_symbol
                merged_history = self._merge_candles_by_timestamp(
                    fallback_history,
                    merged_history,
                )

            if not merged_history:
                continue

            if self.timeframe == "1s":
                self.candles_by_symbol[symbol] = merged_history[-_MAX_STORED_CANDLES:]
                await self._emit_hydrated_candle_history(symbol)
                continue

            try:
                history_resampler = CandleResampler(self.timeframe)
                seeded: List[Dict[str, Any]] = []
                for candle in merged_history:
                    seeded.extend(history_resampler.add_candle(candle))
                self.candles_by_symbol[symbol] = seeded[-_MAX_STORED_CANDLES:]
                await self._emit_hydrated_candle_history(symbol)
            except Exception:
                logger.exception("[PaperTrading][%s] Failed resampling shared history symbol=%s.", self.run_id, symbol)

        self.candles = self.candles_by_symbol.get(self.primary_symbol, [])

    async def _on_market_candle(self, symbol: str, candle: Dict[str, float]) -> None:
        if not self.active:
            return

        if self.timeframe == "1s":
            await self._on_candle(symbol, candle)
            return

        resampler = self._resamplers.get(symbol)
        if resampler is None:
            resampler = CandleResampler(self.timeframe)
            self._resamplers[symbol] = resampler

        try:
            closed_candles = resampler.add_candle(candle)
        except Exception:
            logger.exception("[PaperTrading][%s] Failed resampling live candle symbol=%s.", self.run_id, symbol)
            return

        for closed in closed_candles:
            await self._on_candle(symbol, closed)

    # ==================================================
    # CANDLE HANDLER
    # ==================================================

    async def _on_candle(self, symbol: str, candle: Dict[str, Any]) -> None:
        """
        Called by exchange client ONLY when a candle is closed.
        Candle must match your engine’s canonical schema:
          { open, high, low, close, volume, timestamp }
        """
        if not self.active:
            return

        min_tick_interval = 1.0 / _MAX_ENGINE_TICKS_PER_SECOND
        now = time.monotonic()
        if self._last_tick_wall_time > 0 and (now - self._last_tick_wall_time) < min_tick_interval:
            return
        self._last_tick_wall_time = now

        self.candles_by_symbol.setdefault(symbol, []).append(candle)
        self.candles_by_symbol[symbol] = self.candles_by_symbol[symbol][-_MAX_STORED_CANDLES:]
        if symbol == self.primary_symbol:
            self.candles = self.candles_by_symbol[symbol]
        await self._process_candle(symbol, candle)

    def _serialize_open_orders(self, symbol: str) -> List[Dict[str, Any]]:
        serialized: List[Dict[str, Any]] = []
        for order in self.pending_orders_by_symbol.get(symbol, []):
            if str(order.get("status", "pending")) != "pending":
                continue
            serialized.append(
                {
                    "id": str(order["id"]),
                    "symbol": symbol,
                    "side": str(order["side"]),
                    "order_type": str(order["order_type"]),
                    "price": order.get("price"),
                    "stop_price": order.get("stop_price"),
                    "quantity": order.get("quantity"),
                    "status": str(order.get("status", "pending")),
                    "created_at": int(order.get("created_at", 0)),
                    "filled_at": order.get("filled_at"),
                }
            )
        return serialized

    async def _emit_order_event(self, event_type: str, order: Dict[str, Any], symbol: str, reason: Optional[str] = None) -> None:
        payload: Dict[str, Any] = {
            "id": str(order["id"]),
            "symbol": symbol,
            "side": str(order["side"]),
            "order_type": str(order["order_type"]),
            "price": float(order["price"]) if order.get("price") is not None else None,
            "stop_price": float(order["stop_price"]) if order.get("stop_price") is not None else None,
            "quantity": float(order["quantity"]) if order.get("quantity") is not None else None,
            "status": str(order.get("status", "pending")),
            "created_at": int(order.get("created_at", 0)),
            "filled_at": int(order["filled_at"]) if order.get("filled_at") is not None else None,
        }
        if reason:
            payload["reason"] = reason
        await emit_event(self.run_id, event_type, payload)

    async def _create_order(
        self,
        *,
        symbol: str,
        action: str,
        order_type: str,
        timestamp: int,
        price: Optional[float] = None,
        stop_price: Optional[float] = None,
        size_pct: Optional[float] = None,
        size_qty: Optional[float] = None,
        reduce_only: bool = False,
    ) -> None:
        side = "SELL" if action in {"SELL", "CLOSE"} else "BUY"
        order: Dict[str, Any] = {
            "id": str(uuid4()),
            "symbol": symbol,
            "side": side,
            "order_type": order_type,
            "price": price,
            "stop_price": stop_price,
            "quantity": size_qty,
            "size_pct": size_pct,
            "reduce_only": bool(reduce_only),
            "status": "pending",
            "created_at": int(timestamp),
            "filled_at": None,
            "triggered": False,
        }

        needs_price = order_type in {"limit", "stop_limit"}
        needs_stop = order_type in {"stop", "stop_limit"}
        if needs_price and order.get("price") is None:
            order["status"] = "cancelled"
            await self._emit_order_event("order_cancelled", order, symbol, "missing_price")
            return
        if needs_stop and order.get("stop_price") is None:
            order["status"] = "cancelled"
            await self._emit_order_event("order_cancelled", order, symbol, "missing_stop_price")
            return

        self.pending_orders_by_symbol.setdefault(symbol, []).append(order)
        if symbol == self.primary_symbol:
            self.pending_orders = self.pending_orders_by_symbol[symbol]
        await self._emit_order_event("order_created", order, symbol)

    def _cooldown_ok(self, timestamp: int) -> bool:
        cooldown_seconds = int(getattr(self.config, "cooldown_seconds", 0))
        if cooldown_seconds <= 0:
            return True
        if self.last_exit_ts is None:
            return True
        return (timestamp - self.last_exit_ts) >= cooldown_seconds * 1000

    async def _evaluate_pending_orders(self, symbol: str, candle: Dict[str, Any], timestamp: int, market_price: float) -> None:
        low = float(candle["low"])
        high = float(candle["high"])
        still_pending: List[Dict[str, Any]] = []

        for order in self.pending_orders_by_symbol.get(symbol, []):
            if str(order.get("status", "pending")) != "pending":
                continue

            side = str(order.get("side", "BUY")).upper()
            order_type = str(order.get("order_type", "market")).lower()
            limit_price = float(order["price"]) if order.get("price") is not None else None
            stop_price = float(order["stop_price"]) if order.get("stop_price") is not None else None

            fill_now = False
            fill_price = float(market_price)

            if order_type == "market":
                fill_now = True
            elif order_type == "limit":
                if side == "BUY" and limit_price is not None and low <= limit_price:
                    fill_now = True
                    fill_price = float(limit_price)
                elif side == "SELL" and limit_price is not None and high >= limit_price:
                    fill_now = True
                    fill_price = float(limit_price)
            elif order_type == "stop":
                if side == "BUY" and stop_price is not None and high >= stop_price:
                    fill_now = True
                elif side == "SELL" and stop_price is not None and low <= stop_price:
                    fill_now = True
            elif order_type == "stop_limit":
                triggered = bool(order.get("triggered", False))
                if not triggered:
                    if side == "BUY" and stop_price is not None and high >= stop_price:
                        order["triggered"] = True
                        triggered = True
                    elif side == "SELL" and stop_price is not None and low <= stop_price:
                        order["triggered"] = True
                        triggered = True
                if triggered and limit_price is not None:
                    if side == "BUY" and low <= limit_price:
                        fill_now = True
                        fill_price = float(limit_price)
                    elif side == "SELL" and high >= limit_price:
                        fill_now = True
                        fill_price = float(limit_price)

            if not fill_now:
                still_pending.append(order)
                continue

            reduce_only = bool(order.get("reduce_only", False))
            size_pct = float(order["size_pct"]) if order.get("size_pct") is not None else None
            size_qty = float(order["quantity"]) if order.get("quantity") is not None else None

            executed = False
            if side == "BUY":
                if reduce_only:
                    order["status"] = "cancelled"
                    await self._emit_order_event("order_cancelled", order, symbol, "reduce_only_buy_not_supported")
                elif self._cooldown_ok(timestamp) and (
                    bool(getattr(self.config, "allow_reentry", True)) or not self.reentry_blocked
                ):
                    executed = await self._open_position(
                        "LONG",
                        fill_price,
                        timestamp,
                        symbol=symbol,
                        size_pct=size_pct,
                        size_qty=size_qty,
                    )
                    if not executed:
                        order["status"] = "cancelled"
                        await self._emit_order_event("order_cancelled", order, symbol, "open_rejected")
                else:
                    still_pending.append(order)
                    continue
            else:
                if self.positions.get(symbol) is None:
                    order["status"] = "cancelled"
                    await self._emit_order_event("order_cancelled", order, symbol, "no_position_to_close")
                else:
                    executed = await self._close_position(fill_price, timestamp, symbol=symbol)
                    if not executed:
                        order["status"] = "cancelled"
                        await self._emit_order_event("order_cancelled", order, symbol, "close_rejected")

            if executed:
                order["status"] = "filled"
                order["filled_at"] = int(timestamp)
                await self._emit_order_event("order_filled", order, symbol)

        self.pending_orders_by_symbol[symbol] = still_pending
        if symbol == self.primary_symbol:
            self.pending_orders = still_pending

    # ==================================================
    # CORE LOGIC
    # ==================================================

    async def _process_candle(self, symbol: str, candle: Dict[str, Any]) -> None:
        # Defensive schema checks (will surface quickly in logs)
        for k in ("open", "high", "low", "close", "volume", "timestamp"):
            if k not in candle:
                logger.error("[PaperTrading][%s] INVALID CANDLE missing=%s candle=%s", self.run_id, k, candle)
                return

        price = float(candle["close"])
        timestamp = int(candle["timestamp"])
        self.last_prices[symbol] = price
        if symbol == self.primary_symbol:
            self.last_price = price
        self.portfolio.apply_price_update_for_symbol(symbol, price)
        self._sync_from_portfolio()

        # Emit candle event (backend will broadcast via socket)
        await emit_event(
            self.run_id,
            "candle",
            {
                "timestamp": timestamp,
                "open": float(candle["open"]),
                "high": float(candle["high"]),
                "low": float(candle["low"]),
                "close": float(candle["close"]),
                "volume": float(candle["volume"]),
                "symbol": symbol,
            },
        )

        # Recompute indicators based on your existing design
        symbol_candles = self.candles_by_symbol.get(symbol, [])
        indicator_series = compute_indicator_series(symbol_candles, self.config)

        current_equity = float(self.portfolio.state.total_equity)
        peak_equity = max(
            (float(point.get("equity", 0.0)) for point in self.equity_curve),
            default=float(current_equity),
        )
        drawdown_pct = (
            ((peak_equity - current_equity) / peak_equity) * 100.0
            if peak_equity > 0
            else 0.0
        )
        position_metrics = self.portfolio.position_metrics(price, symbol=symbol)
        exposure_pct = (
            (float(position_metrics.get("market_value", 0.0)) / max(float(current_equity), 1e-12)) * 100.0
            if position_metrics is not None and current_equity > 0
            else 0.0
        )

        ctx = build_context(
            index=len(symbol_candles) - 1,
            candles=symbol_candles,
            indicator_series=indicator_series,
            position=position_metrics,
            balance=float(self.quote_balance),
            initial_balance=self.initial_balance,
            timeframe=self.timeframe,
            history_window=100,
            exchange=self.exchange,
            symbol=symbol,
            fee_rate=float(self.fee_rate),
            slippage_bps=float(getattr(self.config, "slippage_bps", 0.0)),
            realized_pnl=float(self.realized_pnl),
            unrealized_pnl=float(self._compute_unrealized_pnl(price, symbol=symbol)),
            equity=float(current_equity),
            cash_balance=float(self.quote_balance),
            exposure_pct=float(exposure_pct),
            open_positions=int(self.portfolio.open_positions_count()),
            current_drawdown_pct=float(drawdown_pct),
            execution_model=str(getattr(self.config, "execution_model", "next_open")),
            stop_fill_model=str(getattr(self.config, "stop_fill_model", "stop_price")),
            leverage=float(getattr(self.config, "leverage", 1.0)),
            margin_mode=str(getattr(self.config, "margin_mode", "isolated")),
            params=dict(getattr(self.config, "params", {}) or {}),
            open_orders=self._serialize_open_orders(symbol),
            symbols=self.symbols,
            markets={
                item: {
                    "exchange": self.exchange,
                    "symbol": item,
                    "timeframe": self.timeframe,
                    "last_price": self.last_prices.get(item),
                }
                for item in self.symbols
            },
            positions=self.positions,
        )

        # Backward compat adapter (prevents KeyError "close" in strategies)
        ctx = _adapt_context_for_strategies(ctx)

        # ==================================================
        # STRATEGY EVAL (NON-FATAL BY DEFAULT)
        # ==================================================
        try:
            raw_signal = self.generate_signal(ctx)
            structured_order = _normalize_order_instruction(raw_signal)
            intent = _safe_intent(raw_signal)
        except (KeyError, ZeroDivisionError, ValueError) as e:
            # Mirror validator philosophy: treat as HOLD and log
            logger.warning(
                "[PaperTrading][%s] Strategy exception treated as HOLD: %s (%s). "
                "Tip: use ctx['candle']['close'] or rely on injected ctx['close'].",
                self.run_id,
                type(e).__name__,
                str(e),
            )
            await emit_event(self.run_id, "error", {"message": f"strategy_error:{type(e).__name__}:{str(e)}"})
            if _STRATEGY_CRASH_IS_FATAL:
                raise
            intent = "HOLD"
            structured_order = None
        except Exception as e:
            logger.exception("[PaperTrading][%s] Strategy crashed (unexpected).", self.run_id)
            await emit_event(self.run_id, "error", {"message": f"strategy_crash:{type(e).__name__}:{str(e)}"})
            if _STRATEGY_CRASH_IS_FATAL:
                raise
            intent = "HOLD"
            structured_order = None

        # ==================================================
        # EXECUTE INTENT
        # ==================================================
        if intent == "HOLD" and not bool(getattr(self.config, "allow_reentry", True)):
            self.reentry_blocked = False

        if structured_order is not None:
            await self._create_order(
                symbol=symbol,
                action=str(structured_order["action"]),
                order_type=str(structured_order["order_type"]),
                timestamp=timestamp,
                price=float(structured_order["price"]) if structured_order.get("price") is not None else None,
                stop_price=(
                    float(structured_order["stop_price"])
                    if structured_order.get("stop_price") is not None
                    else None
                ),
                size_pct=(
                    float(structured_order["size_pct"])
                    if structured_order.get("size_pct") is not None
                    else None
                ),
                size_qty=(
                    float(structured_order["quantity"])
                    if structured_order.get("quantity") is not None
                    else None
                ),
                reduce_only=bool(structured_order.get("reduce_only", False)),
            )
        else:
            normalized_intent = _normalize_signal(intent)
            if normalized_intent == "BUY":
                await self._create_order(
                    symbol=symbol,
                    action="BUY",
                    order_type="market",
                    timestamp=timestamp,
                )
            elif normalized_intent == "SELL":
                await self._create_order(
                    symbol=symbol,
                    action="SELL",
                    order_type="market",
                    timestamp=timestamp,
                    reduce_only=True,
                )

        await self._evaluate_pending_orders(symbol, candle, timestamp, price)

        # ==================================================
        # EMIT BALANCE SNAPSHOT
        # ==================================================
        equity = float(self.portfolio.state.total_equity)

        await emit_event(
            self.run_id,
            "balance",
            {
                "quote_balance": float(self.quote_balance),
                "base_balance": float(self.base_balance),
                "equity": float(equity),
                "last_price": float(price),
                "position": self.positions.get(symbol),
                "symbol": symbol,
                # "timestamp": int(timestamp),
            },
        )
        self._append_equity_point(timestamp, equity=float(equity))
        await self._emit_portfolio_update()

        # Optional: auto-stop safety
        if equity <= 0:
            logger.warning("[PaperTrading][%s] Equity <= 0, stopping session.", self.run_id)
            await self.stop()

        logger.info(
            "[PaperTrading][%s] CANDLE close ts=%s close=%.4f quote=%.2f base=%.6f equity=%.2f intent=%s",
            self.run_id,
            timestamp,
            price,
            self.quote_balance,
            self.base_balance,
            equity,
            intent,
        )

    # ==================================================
    # TRADE LOGIC
    # ==================================================

    async def _open_position(
        self,
        side: str,
        price: float,
        timestamp: int,
        *,
        symbol: str,
        size_pct: Optional[float] = None,
        size_qty: Optional[float] = None,
    ) -> bool:
        if self.quote_balance <= 0:
            return False

        slippage_bps = float(getattr(self.config, "slippage_bps", 0.0))
        expected_execution_price = FixedBpsSlippage(slippage_bps).apply(
            float(price),
            side="LONG",
            is_entry=True,
        )

        batch_size = float(getattr(self.config, "batch_size", 1.0))
        batch_type = getattr(self.config, "batch_size_type", "fixed")
        max_open_positions = int(getattr(self.config, "max_open_positions", 1))
        max_account_exposure_pct = float(getattr(self.config, "max_account_exposure_pct", 100.0))

        if size_qty is not None:
            capital_to_use = float(size_qty) * float(expected_execution_price)
        elif size_pct is not None:
            capital_to_use = self.quote_balance * (float(size_pct) / 100.0)
        elif batch_type == "fixed":
            capital_to_use = min(batch_size, self.quote_balance)
        elif batch_type == "percent_balance":
            capital_to_use = self.quote_balance * (batch_size / 100.0)
        else:
            capital_to_use = self.quote_balance

        if capital_to_use <= 0:
            return False

        if side != "LONG":
            return False

        if max_open_positions <= 0:
            return False

        current_equity = self.quote_balance + (max(0.0, self.base_balance) * price)
        if current_equity <= 0:
            return False

        current_position = self.positions.get(symbol)
        current_notional = max(
            0.0,
            float(current_position["quantity"]) * expected_execution_price if current_position else 0.0,
        )
        requested_notional = float(capital_to_use)
        projected_exposure_pct = (
            ((current_notional + requested_notional) / max(current_equity, 1e-12)) * 100.0
        )
        if projected_exposure_pct > max_account_exposure_pct:
            return False

        opened = self.portfolio.apply_trade_open(
            side=side,
            price=price,
            capital_to_use=capital_to_use,
            fee_rate=self.fee_rate,
            timestamp=timestamp,
            slippage_bps=slippage_bps,
            symbol=symbol,
            quantity_step=self.symbol_lot_sizes.get(symbol),
        )
        if opened is None:
            return False

        fill = opened.get("fill", {})
        self._sync_from_portfolio()
        effective_price = float(fill.get("entry_price", price))
        position_qty = float(fill.get("quantity", 0.0))

        logger.info(
            "[PaperTrading][%s] OPEN %s qty=%.6f entry=%.4f used=%.2f quote=%.2f base=%.6f",
            self.run_id,
            side,
            position_qty,
            effective_price,
            capital_to_use,
            self.quote_balance,
            self.base_balance,
        )

        symbol_position = self.positions.get(symbol)
        await emit_event(self.run_id, "position", {"symbol": symbol, **(symbol_position or {})})
        await emit_event(self.run_id, "position_update", {"symbol": symbol, **(symbol_position or {})})

        # Emit incremental fill event (separate from aggregated position snapshot).
        fill_payload = {
            "side": side,
            "symbol": symbol,
            "entry_price": float(effective_price),
            "exit_price": None,
            "quantity": float(position_qty),
            "entry_notional": float(fill.get("entry_notional", 0.0)),
            "exit_notional": None,
            "entry_fee": float(fill.get("entry_fee", 0.0)),
            "exit_fee": None,
            "total_fee": float(fill.get("entry_fee", 0.0)),
            "gross_pnl": 0.0,
            "net_pnl": 0.0,
            "fee_rate_used": float(fill.get("fee_rate_used", self.fee_rate)),
            "pnl": 0.0,
            "opened_at": int(timestamp),
            "closed_at": None,
        }
        await emit_event(
            self.run_id,
            "trade_fill",
            fill_payload,
        )
        await emit_event(
            self.run_id,
            "trade",
            fill_payload,
        )
        self._append_equity_point(timestamp)
        await self._emit_portfolio_update()
        return True

    async def _close_position(self, price: float, timestamp: int, *, symbol: str) -> bool:
        symbol_position = self.positions.get(symbol)
        if not symbol_position:
            return False

        side = str(symbol_position["side"]).upper()
        if side != "LONG":
            return False

        slippage_bps = float(getattr(self.config, "slippage_bps", 0.0))
        trade = self.portfolio.apply_trade_close(
            price=price,
            fee_rate=self.fee_rate,
            timestamp=timestamp,
            slippage_bps=slippage_bps,
            symbol=symbol,
        )
        if trade is None:
            return False

        self._sync_from_portfolio()
        quantity = float(trade["quantity"])
        entry_price = float(trade["entry_price"])
        effective_exit_price = float(trade["exit_price"])
        pnl = float(trade["pnl"])

        self.trades.append(trade)
        self.position = self.positions.get(self.primary_symbol)
        self.last_exit_ts = int(timestamp)
        if not bool(getattr(self.config, "allow_reentry", True)):
            self.reentry_blocked = True

        logger.info(
            "[PaperTrading][%s] CLOSE %s qty=%.6f exit=%.4f pnl=%.4f quote=%.2f",
            self.run_id,
            side,
            quantity,
            price,
            pnl,
            self.quote_balance,
        )

        trade_with_symbol = {"symbol": symbol, **trade}
        await emit_event(self.run_id, "trade_fill", trade_with_symbol)
        await emit_event(self.run_id, "trade", trade_with_symbol)
        await emit_event(self.run_id, "position_update", None if self.positions.get(symbol) is None else {"symbol": symbol, **self.positions[symbol]})
        self._append_equity_point(timestamp)
        await self._emit_portfolio_update()
        return True


# ======================================================
# SESSION FACTORY
# ======================================================

def build_paper_session(request) -> PaperSession:
    return PaperSession(request)
