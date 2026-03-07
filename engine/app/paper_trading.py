import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx

from .context import build_context
from .events import get_strategy_event_system
from .indicators import compute_indicator_series
from .market import CandleResampler
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
        self.symbol = request.symbol.upper()
        self.timeframe = request.timeframe

        # Account model (spot-like)
        self.initial_balance = float(request.initial_balance)
        self.quote_balance = float(request.initial_balance)  # e.g. USDT in BTCUSDT
        self.base_balance = 0.0                              # e.g. BTC in BTCUSDT
        self.last_price: Optional[float] = None

        self.fee_rate = float(request.fee_rate) if request.fee_rate is not None else 0.001

        self.position: Optional[Dict[str, Any]] = None
        self.trades: List[Dict[str, Any]] = []
        self.candles: List[Dict[str, Any]] = []
        self.realized_pnl = 0.0
        self.equity_curve: List[Dict[str, float]] = []
        self.portfolio = PortfolioEngine(initial_cash=self.initial_balance)

        self.active = False
        self._subscriber_id = f"paper:{self.run_id}"
        self._event_system = get_strategy_event_system()
        self._resampler: Optional[CandleResampler] = None
        self._last_tick_wall_time = 0.0

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
            "[PaperTrading][%s] Session created exchange=%s symbol=%s timeframe=%s initial_balance=%.2f fee_rate=%.6f",
            self.run_id,
            self.exchange,
            self.symbol,
            self.timeframe,
            self.initial_balance,
            self.fee_rate,
        )

    # ==================================================
    # START / STOP
    # ==================================================

    def _compute_unrealized_pnl(self, current_price: Optional[float] = None) -> float:
        if current_price is not None:
            self.portfolio.apply_price_update(float(current_price))
            self._sync_from_portfolio()
        return float(self.portfolio.state.unrealized_pnl)

    def portfolio_state(self) -> Dict[str, Any]:
        self._sync_from_portfolio()
        unrealized = float(self.portfolio.state.unrealized_pnl)
        usdt_balance = float(self.quote_balance)
        btc_balance = max(0.0, float(self.base_balance))
        equity = float(self.portfolio.state.total_equity)

        return {
            "run_id": self.run_id,
            "balance": usdt_balance,
            "usdt_balance": usdt_balance,
            "btc_balance": btc_balance,
            "equity": float(equity),
            "realized_pnl": float(self.realized_pnl),
            "unrealized_pnl": float(unrealized),
            "open_positions": 1 if self.position else 0,
            "trades_count": len(self.trades),
            "equity_curve": list(self.equity_curve),
        }

    def _sync_from_portfolio(self) -> None:
        position = self.portfolio.position
        self.position = position
        self.quote_balance = float(self.portfolio.state.cash_balance)
        self.base_balance = float(position["quantity"]) if position else 0.0
        self.realized_pnl = float(self.portfolio.state.realized_pnl)
        if self.portfolio.state.last_price is not None:
            self.last_price = float(self.portfolio.state.last_price)

    def _append_equity_point(self, timestamp: int, equity: Optional[float] = None) -> None:
        point_equity = float(
            equity
            if equity is not None
            else (
                float(self.quote_balance)
                + max(0.0, float(self.base_balance))
                * (
                    float(self.last_price)
                    if self.last_price is not None
                    else (float(self.position["entry_price"]) if self.position else 0.0)
                )
            )
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
            "[PaperTrading][%s] START requested. Subscribing to shared market stream exchange=%s symbol=%s timeframe=%s",
            self.run_id,
            self.exchange,
            self.symbol,
            self.timeframe,
        )
        await self._hydrate_history()
        if self.timeframe != "1s":
            self._resampler = CandleResampler(self.timeframe)
        else:
            self._resampler = None

        await self._event_system.register_strategy(
            exchange=self.exchange,
            symbol=self.symbol,
            strategy_id=self._subscriber_id,
            callback=self._on_market_candle,
        )

    async def stop(self) -> None:
        if not self.active:
            return

        logger.info("[PaperTrading][%s] STOP requested.", self.run_id)

        self.active = False

        await self._event_system.unregister_strategy(
            exchange=self.exchange,
            symbol=self.symbol,
            strategy_id=self._subscriber_id,
        )

        await emit_event(self.run_id, "status", {"status": "STOPPED"})
        logger.info("[PaperTrading][%s] STOP completed.", self.run_id)

    # ==================================================
    # MARKET STREAM INTEGRATION
    # ==================================================

    async def _hydrate_history(self) -> None:
        try:
            raw_history = await self._event_system.get_history(
                exchange=self.exchange,
                symbol=self.symbol,
                limit=50_000,
            )
        except Exception:
            logger.exception("[PaperTrading][%s] Failed loading shared market history.", self.run_id)
            return

        if not raw_history:
            return

        if self.timeframe == "1s":
            self.candles = list(raw_history)
            return

        try:
            history_resampler = CandleResampler(self.timeframe)
            seeded: List[Dict[str, Any]] = []
            for candle in raw_history:
                seeded.extend(history_resampler.add_candle(candle))
            self.candles = seeded[-10_000:]
        except Exception:
            logger.exception("[PaperTrading][%s] Failed resampling shared history.", self.run_id)

    async def _on_market_candle(self, candle: Dict[str, float]) -> None:
        if not self.active:
            return

        if self.timeframe == "1s":
            await self._on_candle(candle)
            return

        if self._resampler is None:
            self._resampler = CandleResampler(self.timeframe)

        try:
            closed_candles = self._resampler.add_candle(candle)
        except Exception:
            logger.exception("[PaperTrading][%s] Failed resampling live candle.", self.run_id)
            return

        for closed in closed_candles:
            await self._on_candle(closed)

    # ==================================================
    # CANDLE HANDLER
    # ==================================================

    async def _on_candle(self, candle: Dict[str, Any]) -> None:
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

        self.candles.append(candle)
        await self._process_candle(candle)

    # ==================================================
    # CORE LOGIC
    # ==================================================

    async def _process_candle(self, candle: Dict[str, Any]) -> None:
        # Defensive schema checks (will surface quickly in logs)
        for k in ("open", "high", "low", "close", "volume", "timestamp"):
            if k not in candle:
                logger.error("[PaperTrading][%s] INVALID CANDLE missing=%s candle=%s", self.run_id, k, candle)
                return

        price = float(candle["close"])
        timestamp = int(candle["timestamp"])
        self.last_price = price
        self.portfolio.apply_price_update(price)
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
            },
        )

        # Recompute indicators based on your existing design
        indicator_series = compute_indicator_series(self.candles, self.config)

        # Equity (what strategy should see as "balance" per your paper design)
        current_equity = self.quote_balance + (max(0.0, self.base_balance) * price)

        ctx = build_context(
            index=len(self.candles) - 1,
            candles=self.candles,
            indicator_series=indicator_series,
            position=self.position,
            balance=current_equity,
            initial_balance=self.initial_balance,
            timeframe=self.timeframe,
            history_window=100,
        )

        # Backward compat adapter (prevents KeyError "close" in strategies)
        ctx = _adapt_context_for_strategies(ctx)

        # ==================================================
        # STRATEGY EVAL (NON-FATAL BY DEFAULT)
        # ==================================================
        try:
            raw_signal = self.generate_signal(ctx)
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
        except Exception as e:
            logger.exception("[PaperTrading][%s] Strategy crashed (unexpected).", self.run_id)
            await emit_event(self.run_id, "error", {"message": f"strategy_crash:{type(e).__name__}:{str(e)}"})
            if _STRATEGY_CRASH_IS_FATAL:
                raise
            intent = "HOLD"

        # ==================================================
        # EXECUTE INTENT
        # ==================================================
        if intent in ("CLOSE", "SELL", "SHORT") and self.position:
            await self._close_position(price, timestamp)

        elif intent in ("BUY", "LONG") and not self.position:
            await self._open_position("LONG", price, timestamp)

        # ==================================================
        # EMIT BALANCE SNAPSHOT
        # ==================================================
        equity = self.quote_balance + (max(0.0, self.base_balance) * price)

        await emit_event(
            self.run_id,
            "balance",
            {
                "quote_balance": float(self.quote_balance),
                "base_balance": float(self.base_balance),
                "equity": float(equity),
                "last_price": float(price),
                "position": self.position,
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

    async def _open_position(self, side: str, price: float, timestamp: int) -> None:
        if self.quote_balance <= 0:
            return

        batch_size = float(getattr(self.config, "batch_size", 1.0))
        batch_type = getattr(self.config, "batch_size_type", "fixed")

        if batch_type == "fixed":
            capital_to_use = min(batch_size, self.quote_balance)
        elif batch_type == "percent_balance":
            capital_to_use = self.quote_balance * (batch_size / 100.0)
        else:
            capital_to_use = self.quote_balance

        if capital_to_use <= 0:
            return

        if side != "LONG":
            return

        slippage_bps = float(getattr(self.config, "slippage_bps", 0.0))
        opened = self.portfolio.apply_trade_open(
            side=side,
            price=price,
            capital_to_use=capital_to_use,
            fee_rate=self.fee_rate,
            timestamp=timestamp,
            slippage_bps=slippage_bps,
        )
        if opened is None:
            return

        self._sync_from_portfolio()
        effective_price = float(opened["entry_price"])
        position_qty = float(opened["quantity"])

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

        await emit_event(self.run_id, "position", self.position)

        # Emit an "open trade" snapshot immediately so UI can show ongoing trade if desired
        await emit_event(
            self.run_id,
            "trade",
            {
                "side": side,
                "entry_price": float(effective_price),
                "exit_price": None,
                "quantity": float(position_qty),
                "pnl": 0.0,
                "opened_at": int(timestamp),
                "closed_at": None,
            },
        )
        self._append_equity_point(timestamp)
        await self._emit_portfolio_update()

    async def _close_position(self, price: float, timestamp: int) -> None:
        if not self.position:
            return

        side = str(self.position["side"]).upper()
        if side != "LONG":
            return

        slippage_bps = float(getattr(self.config, "slippage_bps", 0.0))
        trade = self.portfolio.apply_trade_close(
            price=price,
            fee_rate=self.fee_rate,
            timestamp=timestamp,
            slippage_bps=slippage_bps,
        )
        if trade is None:
            return

        self._sync_from_portfolio()
        quantity = float(trade["quantity"])
        entry_price = float(trade["entry_price"])
        effective_exit_price = float(trade["exit_price"])
        pnl = float(trade["pnl"])

        self.trades.append(trade)
        self.position = None

        logger.info(
            "[PaperTrading][%s] CLOSE %s qty=%.6f exit=%.4f pnl=%.4f quote=%.2f",
            self.run_id,
            side,
            quantity,
            price,
            pnl,
            self.quote_balance,
        )

        await emit_event(self.run_id, "trade", trade)
        self._append_equity_point(timestamp)
        await self._emit_portfolio_update()


# ======================================================
# SESSION FACTORY
# ======================================================

def build_paper_session(request) -> PaperSession:
    return PaperSession(request)
