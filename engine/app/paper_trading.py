import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

from .clients import ExchangeFactory
from .context import build_context
from .indicators import compute_indicator_series
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

# Logging controls
# - PAPER_WS_LOG_RAW=1 => print raw ws payloads (throttled)
# - PAPER_WS_LOG_EVERY=N => log raw payload every N messages (default 25)
_PAPER_WS_LOG_RAW = os.getenv("PAPER_WS_LOG_RAW", "0") == "1"
_PAPER_WS_LOG_EVERY = int(os.getenv("PAPER_WS_LOG_EVERY", "25"))

# Strategy safety: do not crash paper stream on strategy exceptions
_STRATEGY_CRASH_IS_FATAL = os.getenv("PAPER_STRATEGY_FATAL", "0") == "1"


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

        self.active = False
        self._stream_task: Optional[asyncio.Task] = None

        # Future live trading credentials (kept for compatibility)
        self.api_key = request.api_key
        self.api_secret = request.api_secret
        self.testnet = request.testnet

        # Exchange client
        self.exchange_client = ExchangeFactory.create(
            exchange=self.exchange,
            api_key=self.api_key,
            api_secret=self.api_secret,
            testnet=self.testnet,
        )

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

    async def start(self) -> None:
        if self.active:
            return

        self.active = True
        await emit_event(self.run_id, "status", {"status": "ACTIVE"})

        logger.info(
            "[PaperTrading][%s] START requested. Launching websocket stream symbol=%s timeframe=%s",
            self.run_id,
            self.symbol,
            self.timeframe,
        )

        async def _run_stream():
            try:
                await self.exchange_client.subscribe_klines(
                    symbol=self.symbol,
                    timeframe=self.timeframe,
                    on_message=self._on_candle,
                    run_id=self.run_id,          # <-- for clearer websocket logs
                    log_raw=_PAPER_WS_LOG_RAW,   # <-- raw payload logging toggle
                    log_every=_PAPER_WS_LOG_EVERY,
                )
            except asyncio.CancelledError:
                logger.info("[PaperTrading][%s] Stream task cancelled.", self.run_id)
                raise
            except Exception:
                logger.exception("[PaperTrading][%s] Stream crashed (unexpected).", self.run_id)
                await emit_event(self.run_id, "error", {"message": "stream_crashed"})
                self.active = False

        self._stream_task = asyncio.create_task(_run_stream())

    async def stop(self) -> None:
        if not self.active:
            return

        logger.info("[PaperTrading][%s] STOP requested.", self.run_id)

        self.active = False

        try:
            await self.exchange_client.close_stream()
        except Exception:
            logger.exception("[PaperTrading][%s] Failed closing exchange stream.", self.run_id)

        if self._stream_task and not self._stream_task.done():
            self._stream_task.cancel()
            try:
                await asyncio.wait_for(self._stream_task, timeout=3.0)
            except asyncio.TimeoutError:
                logger.warning("[PaperTrading][%s] Stream task did not exit in time.", self.run_id)
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("[PaperTrading][%s] Stream task error on stop.", self.run_id)

        self._stream_task = None

        await emit_event(self.run_id, "status", {"status": "STOPPED"})
        logger.info("[PaperTrading][%s] STOP completed.", self.run_id)

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
        current_equity = self.quote_balance + (self.base_balance * price if self.base_balance > 0 else 0.0)

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
        if intent == "CLOSE" and self.position:
            await self._close_position(price, timestamp)

        elif intent in ("BUY", "LONG") and not self.position:
            await self._open_position("LONG", price, timestamp)

        elif intent in ("SELL", "SHORT") and not self.position:
            # NOTE: remains spot-like accounting; true shorts need margin model.
            await self._open_position("SHORT", price, timestamp)

        # ==================================================
        # EMIT BALANCE SNAPSHOT
        # ==================================================
        equity = self.quote_balance + (self.base_balance * price if self.base_balance > 0 else 0.0)

        await emit_event(
            self.run_id,
            "balance",
            {
                "quote_balance": float(self.quote_balance),
                "base_balance": float(self.base_balance),
                "equity": float(equity),
                "last_price": float(price),
                "position": self.position,
                "timestamp": int(timestamp),
            },
        )

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

        slippage_bps = float(getattr(self.config, "slippage_bps", 0.0))
        effective_price = price * (1 + slippage_bps / 10_000)

        gross_qty = capital_to_use / effective_price
        fee_qty = gross_qty * self.fee_rate
        net_qty = gross_qty - fee_qty

        self.base_balance += net_qty
        self.quote_balance -= capital_to_use

        self.position = {
            "side": side,
            "entry_price": float(effective_price),
            "quantity": float(net_qty),
            "opened_at": int(timestamp),
        }

        logger.info(
            "[PaperTrading][%s] OPEN %s qty=%.6f entry=%.4f used=%.2f quote=%.2f base=%.6f",
            self.run_id,
            side,
            net_qty,
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
                "quantity": float(net_qty),
                "pnl": 0.0,
                "opened_at": int(timestamp),
                "closed_at": None,
            },
        )

    async def _close_position(self, price: float, timestamp: int) -> None:
        if not self.position:
            return

        quantity = float(self.position["quantity"])
        entry_price = float(self.position["entry_price"])
        side = str(self.position["side"]).upper()

        if side == "LONG":
            pnl = (price - entry_price) * quantity
        else:
            pnl = (entry_price - price) * quantity

        gross_quote = quantity * price
        fee_quote = gross_quote * self.fee_rate
        net_quote = gross_quote - fee_quote

        self.quote_balance += net_quote
        self.base_balance = 0.0

        trade = {
            "side": side,
            "entry_price": float(entry_price),
            "exit_price": float(price),
            "quantity": float(quantity),
            "pnl": float(pnl),
            "opened_at": int(self.position["opened_at"]),
            "closed_at": int(timestamp),
        }

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


# ======================================================
# SESSION FACTORY
# ======================================================

def build_paper_session(request) -> PaperSession:
    return PaperSession(request)