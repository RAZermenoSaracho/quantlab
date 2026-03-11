from typing import Optional, Tuple, Dict, Any, Callable
from uuid import uuid4

from .validator import SAFE_GLOBALS, ALLOWED_RETURN_VALUES
from .metrics import calculate_metrics
from .clients import ExchangeFactory
from .spec import load_config_from_env

from .indicators import compute_indicator_series
from .context import build_context
from .data.candle_aggregator import expand_minute_candles_to_subminute


SUB_MINUTE_TIMEFRAMES = {"1s", "5s", "15s", "30s"}


# ============================================================
# Signal normalization (backward compatible)
# ============================================================

def _normalize_signal(raw_signal: str, direction: str) -> str:
    """
    Normalize algorithm output to engine-level intents.

    Accepted raw signals (from user algo):
      - "BUY" / "SELL" / "HOLD"   (legacy)
      - "LONG" / "SHORT" / "CLOSE" / "HOLD" (new)

    Output (engine intents):
      - "LONG" | "SHORT" | "CLOSE" | "HOLD"
    """
    if raw_signal is None:
        return "HOLD"

    s = str(raw_signal).strip().upper()

    if s in ("HOLD",):
        return "HOLD"

    if s in ("CLOSE",):
        return "CLOSE"

    if s in ("LONG", "BUY"):
        return "LONG"

    if s in ("SHORT", "SELL"):
        # In long_only, SELL means CLOSE (if in position) not open short.
        return "CLOSE" if direction == "long_only" else "SHORT"

    # Unknown -> HOLD (or raise). I prefer raise to catch bugs early.
    raise Exception(f"Invalid signal '{raw_signal}'. Expected BUY/SELL/HOLD or LONG/SHORT/CLOSE/HOLD.")


# ============================================================
# Execution helpers
# ============================================================

def _apply_slippage(price: float, slippage_bps: float, side: str) -> float:
    """
    Simple market slippage model:
    - BUY pays a bit more
    - SELL receives a bit less
    """
    if slippage_bps <= 0:
        return price

    slip = slippage_bps / 10_000.0
    if side == "BUY":
        return price * (1.0 + slip)
    if side == "SELL":
        return price * (1.0 - slip)
    return price


def _unrealized_pnl(price: float, entry: float, qty: float, side: str) -> float:
    if side == "LONG":
        return (price - entry) * qty
    return (entry - price) * qty


def _pnl_pct_from_prices(current_price: float, entry_price: float, side: str) -> float:
    if entry_price <= 0:
        return 0.0
    if side == "LONG":
        return ((current_price - entry_price) / entry_price) * 100.0
    return ((entry_price - current_price) / entry_price) * 100.0


def _position_with_fee_metrics(
    position: Optional[dict],
    mark_price: float,
) -> Optional[dict]:
    if position is None:
        return None

    side = str(position.get("side", "LONG"))
    entry = float(position.get("average_entry_price", position.get("entry_price", 0.0)))
    qty = float(position.get("quantity", 0.0))
    fee_rate_used = float(position.get("fee_rate_used", 0.0))
    entry_notional = float(position.get("entry_notional", entry * qty))
    entry_fee = float(position.get("fees_paid", position.get("entry_fee", entry_notional * fee_rate_used)))

    gross_pnl = _unrealized_pnl(mark_price, entry, qty, side)
    exit_notional = float(mark_price * qty)
    estimated_exit_fee = float(exit_notional * fee_rate_used)
    total_fee_so_far = float(entry_fee + estimated_exit_fee)
    net_pnl = float(gross_pnl - total_fee_so_far)

    if side == "LONG":
        breakeven_price = (
            (entry_notional + entry_fee) / (max(qty, 1e-12) * max(1.0 - fee_rate_used, 1e-12))
        )
    else:
        breakeven_price = (
            (entry_notional - entry_fee) / (max(qty, 1e-12) * (1.0 + fee_rate_used))
        )

    return {
        **position,
        "average_entry_price": float(entry),
        "market_value": float(mark_price * qty),
        "realized_pnl": float(position.get("realized_pnl", 0.0)),
        "unrealized_pnl": float(net_pnl),
        "fees_paid": float(entry_fee),
        "entries_count": int(position.get("entries_count", 1)),
        "entry_notional": entry_notional,
        "entry_fee": entry_fee,
        "fee_rate_used": fee_rate_used,
        "gross_pnl": float(gross_pnl),
        "estimated_exit_fee": float(estimated_exit_fee),
        "total_fee_so_far": float(total_fee_so_far),
        "net_pnl": float(net_pnl),
        "breakeven_price": float(breakeven_price),
    }


# ============================================================
# Position management
# ============================================================

def _open_position(
    desired_side: str,          # "LONG" | "SHORT"
    balance: float,
    max_allowed_capital: float,
    entry_price: float,
    timestamp: int,
    fee_rate: float,
    config,
    size_pct: Optional[float] = None,
    size_qty: Optional[float] = None,
) -> Optional[dict]:
    """
    Opens a position with:
    - slippage applied based on order side
    - sizing: fixed qty or percent balance
    - exposure cap: notional <= max_allowed_capital
    - NOTE: This simulates "fully collateralized" (no margin calls here),
      but we support leverage as "effective_balance" for sizing if config.leverage exists.
    """
    if desired_side not in ("LONG", "SHORT"):
        return None

    slippage_bps = float(getattr(config, "slippage_bps", 0.0))
    leverage = float(getattr(config, "leverage", 1.0))

    # Entry order direction for slippage:
    entry_order_side = "BUY" if desired_side == "LONG" else "SELL"
    fill_price = _apply_slippage(float(entry_price), slippage_bps, side=entry_order_side)
    if fill_price <= 0:
        return None

    effective_balance = float(balance) * max(1.0, leverage)

    if size_qty is not None:
        qty = float(size_qty)
    elif size_pct is not None:
        pct = float(size_pct) / 100.0
        capital_to_use = effective_balance * pct
        qty = capital_to_use / fill_price if fill_price > 0 else 0.0
    elif getattr(config, "batch_size_type", "fixed") == "fixed":
        qty = float(getattr(config, "batch_size", 0.0))
    else:
        pct = float(getattr(config, "batch_size", 0.0)) / 100.0
        capital_to_use = effective_balance * pct
        qty = capital_to_use / fill_price if fill_price > 0 else 0.0

    if qty <= 0:
        return None

    notional = qty * fill_price

    # Exposure cap (based on initial balance)
    if notional > float(max_allowed_capital):
        return None

    fee_rate_used = float(fee_rate)
    entry_fee = notional * fee_rate_used

    return {
        "side": desired_side,          # LONG | SHORT
        "entry_price": float(fill_price),
        "average_entry_price": float(fill_price),
        "quantity": float(qty),
        "entry_notional": float(notional),
        "entry_fee": float(entry_fee),
        "fees_paid": float(entry_fee),
        "fee_rate_used": float(fee_rate_used),
        "entries_count": 1,
        "realized_pnl": 0.0,
        "opened_at": int(timestamp),
        # trailing tracking (intrabar)
        "max_price": float(fill_price),  # used for LONG
        "min_price": float(fill_price),  # used for SHORT
    }


def _add_to_position(
    position: dict,
    balance: float,
    max_allowed_capital: float,
    price: float,
    timestamp: int,
    fee_rate: float,
    config,
    size_pct: Optional[float] = None,
    size_qty: Optional[float] = None,
) -> Optional[dict]:
    side = str(position.get("side", "LONG"))
    if side not in ("LONG", "SHORT"):
        return None

    slippage_bps = float(getattr(config, "slippage_bps", 0.0))
    leverage = float(getattr(config, "leverage", 1.0))
    entry_order_side = "BUY" if side == "LONG" else "SELL"
    fill_price = _apply_slippage(float(price), slippage_bps, side=entry_order_side)
    if fill_price <= 0:
        return None

    effective_balance = float(balance) * max(1.0, leverage)
    if size_qty is not None:
        qty = float(size_qty)
    elif size_pct is not None:
        pct = float(size_pct) / 100.0
        qty = (effective_balance * pct) / fill_price if fill_price > 0 else 0.0
    elif getattr(config, "batch_size_type", "fixed") == "fixed":
        qty = float(getattr(config, "batch_size", 0.0))
    else:
        pct = float(getattr(config, "batch_size", 0.0)) / 100.0
        qty = (effective_balance * pct) / fill_price if fill_price > 0 else 0.0
    if qty <= 0:
        return None

    additional_notional = qty * fill_price
    current_notional = float(position.get("entry_notional", 0.0))
    if (current_notional + additional_notional) > float(max_allowed_capital):
        return None

    fee_rate_used = float(position.get("fee_rate_used", fee_rate))
    additional_fee = additional_notional * fee_rate_used
    current_qty = float(position.get("quantity", 0.0))
    new_qty = current_qty + qty
    if new_qty <= 0:
        return None

    current_avg = float(position.get("average_entry_price", position.get("entry_price", fill_price)))
    new_avg = ((current_avg * current_qty) + (fill_price * qty)) / new_qty

    position["quantity"] = float(new_qty)
    position["entry_notional"] = float(current_notional + additional_notional)
    position["entry_fee"] = float(position.get("entry_fee", 0.0) + additional_fee)
    position["fees_paid"] = float(position.get("fees_paid", position.get("entry_fee", 0.0)) + additional_fee)
    position["average_entry_price"] = float(new_avg)
    position["entry_price"] = float(new_avg)
    position["entries_count"] = int(position.get("entries_count", 1)) + 1
    position["max_price"] = max(float(position.get("max_price", fill_price)), fill_price)
    position["min_price"] = min(float(position.get("min_price", fill_price)), fill_price)
    return position


def _close_position(
    position: dict,
    exit_price: float,
    timestamp: int,
    fee_rate: float,
    config,
) -> Tuple[dict, float]:
    """
    Closes an existing position at exit_price:
    - slippage depends on exit order side
    - fees applied on entry+exit notional
    Returns (trade_dict, net_pnl)
    """
    side = position["side"]  # LONG | SHORT
    entry = float(position.get("average_entry_price", position["entry_price"]))
    qty = float(position["quantity"])

    slippage_bps = float(getattr(config, "slippage_bps", 0.0))

    exit_order_side = "SELL" if side == "LONG" else "BUY"
    fill_exit = _apply_slippage(float(exit_price), slippage_bps, side=exit_order_side)

    if side == "LONG":
        gross = (fill_exit - entry) * qty
    else:
        gross = (entry - fill_exit) * qty

    entry_notional = float(position.get("entry_notional", entry * qty))
    exit_notional = fill_exit * qty
    fee_rate_used = float(position.get("fee_rate_used", fee_rate))
    entry_fee = float(position.get("fees_paid", position.get("entry_fee", entry_notional * fee_rate_used)))
    exit_fee = exit_notional * fee_rate_used
    total_fee = entry_fee + exit_fee
    net = gross - total_fee

    trade = {
        "side": side,  # LONG | SHORT
        "entry_price": float(entry),
        "average_entry_price": float(entry),
        "exit_price": float(fill_exit),
        "entry_notional": float(entry_notional),
        "exit_notional": float(exit_notional),
        "entry_fee": float(entry_fee),
        "exit_fee": float(exit_fee),
        "total_fee": float(total_fee),
        "gross_pnl": float(gross),
        "net_pnl": float(net),
        "pnl": float(net),  # backward-compatible field = net
        "fee_rate_used": float(fee_rate_used),
        "entries_count": int(position.get("entries_count", 1)),
        "quantity": float(qty),
        "opened_at": int(position["opened_at"]),
        "closed_at": int(timestamp),
        "duration_ms": int(timestamp) - int(position["opened_at"]),
    }

    return trade, float(net)


def _normalize_order_instruction(raw_signal: Any) -> Optional[Dict[str, Any]]:
    if raw_signal is None:
        return None

    if isinstance(raw_signal, dict):
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

    return None


# ============================================================
# Stop / TP / Trailing (intrabar)
# ============================================================

def _check_intrabar_risk_exit(
    position: dict,
    candle: dict,
    config,
) -> Tuple[bool, Optional[float]]:
    """
    Returns (hit, fill_price).

    Uses candle high/low to decide if SL/TP/Trailing hit *within* the bar.
    Fill model:
      - "stop_price": fill at stop price
      - "worst": fill at low/high (worse fill)
    """
    stop_loss_pct = getattr(config, "stop_loss_pct", None)
    take_profit_pct = getattr(config, "take_profit_pct", None)
    trailing_stop_pct = getattr(config, "trailing_stop_pct", None)

    if stop_loss_pct is None and take_profit_pct is None and trailing_stop_pct is None:
        return False, None

    side = position["side"]
    entry = float(position["entry_price"])
    high = float(candle["high"])
    low = float(candle["low"])

    stop_fill_model = str(getattr(config, "stop_fill_model", "stop_price")).lower()

    # --- stop-loss price ---
    sl_price = None
    if stop_loss_pct is not None:
        sl = float(stop_loss_pct) / 100.0
        sl_price = entry * (1.0 - sl) if side == "LONG" else entry * (1.0 + sl)

    # --- take-profit price ---
    tp_price = None
    if take_profit_pct is not None:
        tp = float(take_profit_pct) / 100.0
        tp_price = entry * (1.0 + tp) if side == "LONG" else entry * (1.0 - tp)

    # --- trailing stop ---
    trail_price = None
    if trailing_stop_pct is not None:
        tr = float(trailing_stop_pct) / 100.0
        if side == "LONG":
            max_price = float(position.get("max_price", entry))
            trail_price = max_price * (1.0 - tr)
        else:
            min_price = float(position.get("min_price", entry))
            trail_price = min_price * (1.0 + tr)

    # We assume worst-case ordering inside candle is unknown.
    # Conservative approach: if multiple triggers are hit, pick the one that exits earlier / worse for us.
    candidates = []

    # SL hit?
    if sl_price is not None:
        if side == "LONG" and low <= sl_price:
            fill = sl_price if stop_fill_model == "stop_price" else low
            candidates.append(float(fill))
        if side == "SHORT" and high >= sl_price:
            fill = sl_price if stop_fill_model == "stop_price" else high
            candidates.append(float(fill))

    # TP hit?
    if tp_price is not None:
        if side == "LONG" and high >= tp_price:
            candidates.append(float(tp_price))
        if side == "SHORT" and low <= tp_price:
            candidates.append(float(tp_price))

    # Trailing hit?
    if trail_price is not None:
        if side == "LONG" and low <= trail_price:
            fill = trail_price if stop_fill_model == "stop_price" else low
            candidates.append(float(fill))
        if side == "SHORT" and high >= trail_price:
            fill = trail_price if stop_fill_model == "stop_price" else high
            candidates.append(float(fill))

    if not candidates:
        return False, None

    # Pick worst fill for the position:
    # - LONG: lower fill is worse
    # - SHORT: higher fill is worse
    if side == "LONG":
        return True, float(min(candidates))
    return True, float(max(candidates))


def _compute_total_unrealized(
    positions_by_symbol: Dict[str, Optional[dict]],
    last_prices: Dict[str, float],
) -> float:
    total = 0.0
    for symbol, position in positions_by_symbol.items():
        if position is None:
            continue
        mark = float(last_prices.get(symbol, position.get("entry_price", 0.0)))
        total += _unrealized_pnl(
            price=mark,
            entry=float(position.get("average_entry_price", position.get("entry_price", 0.0))),
            qty=float(position.get("quantity", 0.0)),
            side=str(position.get("side", "LONG")),
        )
    return float(total)


def _compute_portfolio_valuation(
    positions_by_symbol: Dict[str, Optional[dict]],
    last_prices: Dict[str, float],
    cash_balance: float,
) -> tuple[float, float]:
    """
    Mark-to-market valuation:
      equity = cash + sum(long_qty * mark_price) + short_unrealized
      unrealized = sum(position unrealized)
    """
    equity = float(cash_balance)
    total_unrealized = 0.0

    for symbol, position in positions_by_symbol.items():
        if position is None:
            continue

        side = str(position.get("side", "LONG")).upper()
        qty = float(position.get("quantity", 0.0))
        if qty <= 0:
            continue

        entry = float(position.get("average_entry_price", position.get("entry_price", 0.0)))
        mark = float(last_prices.get(symbol, entry))

        if side == "LONG":
            market_value = qty * mark
            cost_basis = float(position.get("entry_notional", entry * qty))
            unrealized = float(market_value - cost_basis)
            equity += market_value
            total_unrealized += unrealized
        else:
            unrealized = _unrealized_pnl(
                price=mark,
                entry=entry,
                qty=qty,
                side=side,
            )
            equity += unrealized
            total_unrealized += unrealized

    return float(equity), float(total_unrealized)


def _compute_capital_deployed(
    positions_by_symbol: Dict[str, Optional[dict]],
    last_prices: Dict[str, float],
) -> float:
    deployed = 0.0
    for symbol, position in positions_by_symbol.items():
        if position is None:
            continue
        qty = float(position.get("quantity", 0.0))
        if qty <= 0:
            continue
        entry = float(position.get("average_entry_price", position.get("entry_price", 0.0)))
        mark = float(last_prices.get(symbol, entry))
        deployed += float(qty * mark)
    return float(deployed)


def _derive_base_asset(symbol: str) -> str:
    sym = str(symbol).upper().strip()
    for quote in ("USDT", "USDC", "BUSD", "USD", "BTC", "ETH"):
        if sym.endswith(quote) and len(sym) > len(quote):
            return sym[: -len(quote)]
    return sym


def _compute_average_holding_seconds(trades: list[dict[str, Any]]) -> float:
    durations: list[float] = []
    for trade in trades:
        opened = trade.get("opened_at")
        closed = trade.get("closed_at")
        if opened is None or closed is None:
            continue
        try:
            opened_ms = float(opened)
            closed_ms = float(closed)
            if closed_ms >= opened_ms:
                durations.append((closed_ms - opened_ms) / 1000.0)
        except Exception:
            continue
    if not durations:
        return 0.0
    return float(sum(durations) / len(durations))


# ============================================================
# Backtest
# ============================================================

def run_backtest(
    code: str,
    exchange: str,
    symbol: str,
    timeframe: str,
    initial_balance: float,
    start_date: str,
    end_date: str,
    fee_rate: Optional[float] = None,
    api_key: Optional[str] = None,
    api_secret: Optional[str] = None,
    testnet: bool = False,
    progress_callback: Optional[Callable[[int], None]] = None,
) -> dict:

    open_positions_at_end = 0

    # ============================
    # SAFE EXECUTION
    # ============================
    execution_env = SAFE_GLOBALS.copy()
    exec(code, execution_env, execution_env)

    if "generate_signal" not in execution_env:
        raise Exception("generate_signal not defined")

    generate_signal = execution_env["generate_signal"]

    # ============================
    # LOAD CONFIG
    # ============================
    config, config_used = load_config_from_env(execution_env)

    direction = str(getattr(config, "direction", "long_only"))
    execution_model = str(getattr(config, "execution_model", "next_open"))  # "same_close" | "next_open"
    cooldown_seconds = int(getattr(config, "cooldown_seconds", 0))
    allow_reentry = bool(getattr(config, "allow_reentry", True))
    min_bars = int(getattr(config, "min_bars", 0))
    symbols = [item.strip().upper() for item in str(symbol).split(",") if item.strip()]
    if not symbols:
        symbols = [str(symbol).upper()]

    # ============================
    # EXCHANGE CLIENT
    # ============================
    client = ExchangeFactory.create(
        exchange=exchange,
        api_key=api_key,
        api_secret=api_secret,
        testnet=testnet,
    )

    final_fee_rate = fee_rate if fee_rate is not None else client.get_default_fee_rate()

    if len(symbols) > 1:
        source_timeframe = "1m" if timeframe in SUB_MINUTE_TIMEFRAMES else timeframe
        symbol_candles: Dict[str, list[dict[str, float]]] = {}
        symbol_indicator_series: Dict[str, Dict[str, list[Any]]] = {}
        first_ts = None
        last_ts = None

        for sym in symbols:
            candles_raw = client.fetch_candles(
                symbol=sym,
                timeframe=source_timeframe,
                start_date=start_date,
                end_date=end_date,
            )
            if not candles_raw:
                continue

            candles_for_symbol: list[dict[str, float]] = []
            for c in candles_raw:
                candles_for_symbol.append({
                    "open": float(c[1]),
                    "high": float(c[2]),
                    "low": float(c[3]),
                    "close": float(c[4]),
                    "volume": float(c[5]),
                    "timestamp": int(c[0]),
                })

            if timeframe in SUB_MINUTE_TIMEFRAMES:
                candles_for_symbol = expand_minute_candles_to_subminute(candles_for_symbol, timeframe)

            if not candles_for_symbol:
                continue

            symbol_candles[sym] = candles_for_symbol
            symbol_indicator_series[sym] = compute_indicator_series(candles_for_symbol, config)
            first_ts = (
                int(candles_for_symbol[0]["timestamp"])
                if first_ts is None
                else min(first_ts, int(candles_for_symbol[0]["timestamp"]))
            )
            last_ts = (
                int(candles_for_symbol[-1]["timestamp"])
                if last_ts is None
                else max(last_ts, int(candles_for_symbol[-1]["timestamp"]))
            )

        if not symbol_candles:
            raise Exception("No candles returned for the selected period.")

        balance = float(initial_balance)
        max_exposure_pct = float(getattr(config, "max_account_exposure_pct", 100.0))
        positions_by_symbol: Dict[str, Optional[dict]] = {sym: None for sym in symbols}
        pending_orders_by_symbol: Dict[str, list[dict[str, Any]]] = {sym: [] for sym in symbols}
        last_prices: Dict[str, float] = {}
        last_exit_ts_by_symbol: Dict[str, Optional[int]] = {sym: None for sym in symbols}
        reentry_blocked_by_symbol: Dict[str, bool] = {sym: False for sym in symbols}

        trades: list[dict[str, Any]] = []
        order_events: list[dict[str, Any]] = []
        equity_curve: list[dict[str, float]] = []
        realized_pnl = 0.0
        wins: list[float] = []
        losses: list[float] = []
        peak_equity = float(initial_balance)
        max_dd = 0.0
        exposure_time_ms = 0.0
        exposure_open_ts: Optional[int] = None
        previous_has_position = False
        candles_with_position = 0
        total_candles_processed = 0
        capital_utilization_sum = 0.0
        capital_utilization_points = 0
        first_processed_ts: Optional[int] = None
        last_processed_ts: Optional[int] = None

        history_window = max(
            int(getattr(config, "min_bars", 1)),
            int(getattr(config, "lookback_window", 1)),
            int(getattr(config, "volume_window", 1)),
            int(getattr(config, "volatility_window", 1)),
            int(getattr(config, "fast_ma_window", 1)),
            int(getattr(config, "slow_ma_window", 1)),
            int(getattr(config, "rsi_window", 1)),
        ) + 5

        timeline: list[tuple[int, str, int]] = []
        for sym, candles_for_symbol in symbol_candles.items():
            for idx, c in enumerate(candles_for_symbol):
                timeline.append((int(c["timestamp"]), sym, idx))
        timeline.sort(key=lambda item: (item[0], item[1]))

        total = max(len(timeline), 1)
        for step, (ts, sym, idx) in enumerate(timeline):
            if first_processed_ts is None:
                first_processed_ts = int(ts)
            last_processed_ts = int(ts)
            if progress_callback:
                progress_callback(max(int((step / total) * 100), 55))

            candles_for_symbol = symbol_candles[sym]
            candle = candles_for_symbol[idx]
            low = float(candle["low"])
            high = float(candle["high"])
            close = float(candle["close"])
            last_prices[sym] = close

            if execution_model == "same_close":
                exec_price = close
            else:
                if idx + 1 < len(candles_for_symbol):
                    exec_price = float(candles_for_symbol[idx + 1]["open"])
                else:
                    exec_price = close

            current_position = positions_by_symbol.get(sym)
            if current_position is not None:
                if current_position["side"] == "LONG":
                    current_position["max_price"] = max(float(current_position.get("max_price", current_position["entry_price"])), float(candle["high"]))
                else:
                    current_position["min_price"] = min(float(current_position.get("min_price", current_position["entry_price"])), float(candle["low"]))

            position_for_ctx = _position_with_fee_metrics(
                position=current_position,
                mark_price=close,
            )
            positions_for_ctx = {
                k: _position_with_fee_metrics(v, float(last_prices.get(k, v.get("entry_price", 0.0)))) if v is not None else None
                for k, v in positions_by_symbol.items()
            }

            equity_for_ctx, unreal_for_ctx = _compute_portfolio_valuation(
                positions_by_symbol=positions_by_symbol,
                last_prices=last_prices,
                cash_balance=balance,
            )
            current_notional = float(current_position.get("entry_notional", 0.0)) if current_position is not None else 0.0
            current_exposure_pct = (
                (current_notional / max(equity_for_ctx, 1e-12)) * 100.0
                if current_position is not None and equity_for_ctx > 0
                else 0.0
            )

            ctx = build_context(
                index=idx,
                candles=candles_for_symbol,
                indicator_series=symbol_indicator_series[sym],
                position=position_for_ctx,
                balance=balance,
                initial_balance=float(initial_balance),
                timeframe=timeframe,
                history_window=history_window,
                exchange=exchange,
                symbol=sym,
                fee_rate=float(final_fee_rate),
                slippage_bps=float(getattr(config, "slippage_bps", 0.0)),
                realized_pnl=float(realized_pnl),
                unrealized_pnl=float(unreal_for_ctx),
                equity=float(equity_for_ctx),
                cash_balance=float(balance),
                exposure_pct=float(current_exposure_pct),
                open_positions=len([value for value in positions_by_symbol.values() if value is not None]),
                current_drawdown_pct=float(max_dd * 100.0),
                execution_model=str(getattr(config, "execution_model", "next_open")),
                stop_fill_model=str(getattr(config, "stop_fill_model", "stop_price")),
                leverage=float(getattr(config, "leverage", 1.0)),
                margin_mode=str(getattr(config, "margin_mode", "isolated")),
                params=dict(getattr(config, "params", {}) or {}),
                open_orders=[
                    {
                        "id": str(order["id"]),
                        "symbol": sym,
                        "side": str(order["side"]),
                        "order_type": str(order["order_type"]),
                        "price": order.get("price"),
                        "stop_price": order.get("stop_price"),
                        "quantity": order.get("quantity"),
                        "status": str(order.get("status", "pending")),
                        "created_at": int(order.get("created_at", ts)),
                        "filled_at": order.get("filled_at"),
                    }
                    for order in pending_orders_by_symbol[sym]
                    if str(order.get("status", "pending")) == "pending"
                ],
                symbols=symbols,
                markets={item: {"exchange": exchange, "symbol": item, "timeframe": timeframe, "last_price": last_prices.get(item)} for item in symbols},
                positions={item: value for item, value in positions_for_ctx.items() if value is not None},
            )

            if idx < min_bars:
                intent = "HOLD"
            else:
                raw_signal = generate_signal(ctx)
                structured_order = _normalize_order_instruction(raw_signal)
                if structured_order is not None:
                    action = str(structured_order["action"])
                    order_type = str(structured_order["order_type"])
                    if action in ("BUY", "SELL", "CLOSE"):
                        order = {
                            "id": str(uuid4()),
                            "symbol": sym,
                            "side": "SELL" if action == "CLOSE" else action,
                            "order_type": order_type,
                            "price": structured_order.get("price"),
                            "stop_price": structured_order.get("stop_price"),
                            "quantity": structured_order.get("quantity"),
                            "size_pct": structured_order.get("size_pct"),
                            "reduce_only": bool(structured_order.get("reduce_only", False)),
                            "status": "pending",
                            "created_at": ts,
                            "filled_at": None,
                            "triggered": False,
                        }
                        needs_price = order_type in {"limit", "stop_limit"}
                        needs_stop = order_type in {"stop", "stop_limit"}
                        if needs_price and order.get("price") is None:
                            order["status"] = "cancelled"
                            order_events.append({"event_type": "order_cancelled", "reason": "missing_price", **order})
                        elif needs_stop and order.get("stop_price") is None:
                            order["status"] = "cancelled"
                            order_events.append({"event_type": "order_cancelled", "reason": "missing_stop_price", **order})
                        else:
                            pending_orders_by_symbol[sym].append(order)
                            order_events.append({"event_type": "order_created", **order})
                    intent = "HOLD"
                else:
                    if raw_signal not in ALLOWED_RETURN_VALUES and str(raw_signal).upper() not in ("LONG", "SHORT", "CLOSE"):
                        raise Exception(f"Invalid signal '{raw_signal}'. Allowed: {ALLOWED_RETURN_VALUES} (+ LONG/SHORT/CLOSE).")
                    intent = _normalize_signal(str(raw_signal), direction)

            still_pending: list[dict[str, Any]] = []
            for order in pending_orders_by_symbol[sym]:
                if str(order.get("status", "pending")) != "pending":
                    continue
                side = str(order.get("side", "BUY")).upper()
                order_type = str(order.get("order_type", "market")).lower()
                limit_price = float(order["price"]) if order.get("price") is not None else None
                stop_price = float(order["stop_price"]) if order.get("stop_price") is not None else None
                fill_now = False
                fill_price = float(exec_price)

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

                size_pct = float(order["size_pct"]) if order.get("size_pct") is not None else None
                size_qty = float(order["quantity"]) if order.get("quantity") is not None else None
                current_position = positions_by_symbol[sym]
                executed = False

                if side == "BUY":
                    dynamic_max_allowed_capital = max(0.0, float(balance) * (max_exposure_pct / 100.0))
                    if current_position is None:
                        opened = _open_position("LONG", balance, dynamic_max_allowed_capital, float(fill_price), ts, float(final_fee_rate), config, size_pct=size_pct, size_qty=size_qty)
                        if opened is not None:
                            positions_by_symbol[sym] = opened
                            executed = True
                    elif current_position["side"] == "LONG":
                        added = _add_to_position(current_position, balance, dynamic_max_allowed_capital, float(fill_price), ts, float(final_fee_rate), config, size_pct=size_pct, size_qty=size_qty)
                        if added is not None:
                            positions_by_symbol[sym] = added
                            executed = True
                else:
                    if current_position is not None:
                        trade, pnl = _close_position(current_position, float(fill_price), ts, float(final_fee_rate), config)
                        trade["symbol"] = sym
                        trades.append(trade)
                        balance += pnl
                        realized_pnl += float(pnl)
                        (wins if pnl > 0 else losses).append(pnl)
                        positions_by_symbol[sym] = None
                        last_exit_ts_by_symbol[sym] = ts
                        if not allow_reentry:
                            reentry_blocked_by_symbol[sym] = True
                        executed = True

                if executed:
                    order["status"] = "filled"
                    order["filled_at"] = ts
                    order_events.append({"event_type": "order_filled", **order})
                else:
                    still_pending.append(order)

            pending_orders_by_symbol[sym] = still_pending

            if not allow_reentry and intent == "HOLD":
                reentry_blocked_by_symbol[sym] = False

            def _cooldown_ok() -> bool:
                if cooldown_seconds <= 0:
                    return True
                last_exit_ts = last_exit_ts_by_symbol.get(sym)
                if last_exit_ts is None:
                    return True
                return (ts - last_exit_ts) >= cooldown_seconds * 1000

            current_position = positions_by_symbol[sym]
            if current_position is not None:
                hit, fill_price = _check_intrabar_risk_exit(current_position, candle, config)
                if hit and fill_price is not None:
                    trade, pnl = _close_position(current_position, float(fill_price), ts, float(final_fee_rate), config)
                    trade["symbol"] = sym
                    trades.append(trade)
                    balance += pnl
                    realized_pnl += float(pnl)
                    (wins if pnl > 0 else losses).append(pnl)
                    positions_by_symbol[sym] = None
                    last_exit_ts_by_symbol[sym] = ts
                    if not allow_reentry:
                        reentry_blocked_by_symbol[sym] = True

            current_position = positions_by_symbol[sym]
            if intent == "CLOSE":
                if current_position is not None:
                    trade, pnl = _close_position(current_position, float(exec_price), ts, float(final_fee_rate), config)
                    trade["symbol"] = sym
                    trades.append(trade)
                    balance += pnl
                    realized_pnl += float(pnl)
                    (wins if pnl > 0 else losses).append(pnl)
                    positions_by_symbol[sym] = None
                    last_exit_ts_by_symbol[sym] = ts
                    if not allow_reentry:
                        reentry_blocked_by_symbol[sym] = True
            elif intent in ("LONG", "SHORT"):
                if direction == "long_only" and intent == "SHORT":
                    pass
                elif not allow_reentry and reentry_blocked_by_symbol[sym]:
                    pass
                elif not _cooldown_ok():
                    pass
                else:
                    dynamic_max_allowed_capital = max(0.0, float(balance) * (max_exposure_pct / 100.0))
                    if current_position is None:
                        positions_by_symbol[sym] = _open_position(intent, balance, dynamic_max_allowed_capital, float(exec_price), ts, float(final_fee_rate), config)
                    elif current_position["side"] == intent:
                        added = _add_to_position(current_position, balance, dynamic_max_allowed_capital, float(exec_price), ts, float(final_fee_rate), config)
                        if added is not None:
                            positions_by_symbol[sym] = added
                    else:
                        trade, pnl = _close_position(current_position, float(exec_price), ts, float(final_fee_rate), config)
                        trade["symbol"] = sym
                        trades.append(trade)
                        balance += pnl
                        realized_pnl += float(pnl)
                        (wins if pnl > 0 else losses).append(pnl)
                        positions_by_symbol[sym] = None
                        last_exit_ts_by_symbol[sym] = ts
                        if not allow_reentry:
                            reentry_blocked_by_symbol[sym] = True
                        if allow_reentry and _cooldown_ok():
                            positions_by_symbol[sym] = _open_position(intent, balance, dynamic_max_allowed_capital, float(exec_price), ts, float(final_fee_rate), config)

            equity, _ = _compute_portfolio_valuation(
                positions_by_symbol=positions_by_symbol,
                last_prices=last_prices,
                cash_balance=balance,
            )
            current_has_position = any(value is not None for value in positions_by_symbol.values())
            if current_has_position and not previous_has_position:
                exposure_open_ts = int(ts)
            elif (not current_has_position) and previous_has_position and exposure_open_ts is not None:
                exposure_time_ms += max(0.0, float(int(ts) - exposure_open_ts))
                exposure_open_ts = None
            previous_has_position = current_has_position

            total_candles_processed += 1
            if current_has_position:
                candles_with_position += 1
            capital_deployed = _compute_capital_deployed(positions_by_symbol, last_prices)
            if equity > 0:
                capital_utilization_sum += float((capital_deployed / equity) * 100.0)
                capital_utilization_points += 1

            if equity <= 0:
                break
            equity_curve.append({"timestamp": ts, "equity": float(equity)})
            if equity > peak_equity:
                peak_equity = equity
            dd = (peak_equity - equity) / peak_equity if peak_equity else 0.0
            max_dd = max(max_dd, dd)
            if getattr(config, "max_drawdown_pct", None) is not None and (dd * 100.0) >= float(config.max_drawdown_pct):
                break

        open_positions_at_end = len([p for p in positions_by_symbol.values() if p is not None])
        if previous_has_position and exposure_open_ts is not None:
            end_ts_for_exposure = int(last_processed_ts if last_processed_ts is not None else (last_ts or 0))
            exposure_time_ms += max(0.0, float(end_ts_for_exposure - exposure_open_ts))
            exposure_open_ts = None

        final_equity, final_unrealized_pnl = _compute_portfolio_valuation(
            positions_by_symbol=positions_by_symbol,
            last_prices=last_prices,
            cash_balance=balance,
        )
        if equity_curve:
            equity_curve[-1]["equity"] = float(final_equity)
        else:
            equity_curve.append({"timestamp": int(last_ts or 0), "equity": float(final_equity)})

        total_return_usdt = final_equity - float(initial_balance)
        total_return_percent = (total_return_usdt / float(initial_balance)) * 100.0 if initial_balance else 0.0
        total_trades = len(trades)
        win_rate_percent = (len([x for x in wins if x > 0]) / total_trades * 100.0) if total_trades else 0.0
        total_wins = float(sum([x for x in wins if x > 0]))
        total_losses = float(abs(sum([x for x in losses if x < 0]))) if losses else 0.0
        profit_factor = (total_wins / total_losses) if total_losses > 0 else 0.0
        open_positions = []
        holdings_by_symbol = []
        for sym in symbols:
            position = positions_by_symbol.get(sym)
            qty = float(position.get("quantity", 0.0)) if position is not None else 0.0
            entry_price = float(
                position.get("average_entry_price", position.get("entry_price", 0.0))
            ) if position is not None else 0.0
            mark_price = float(last_prices.get(sym, entry_price if entry_price > 0 else 0.0))
            cost_basis = float(position.get("entry_notional", entry_price * qty)) if position is not None else 0.0
            unrealized_pnl = float((qty * mark_price) - cost_basis)
            holdings_by_symbol.append(
                {
                    "symbol": sym,
                    "base_asset": _derive_base_asset(sym),
                    "quantity": qty,
                    "last_price": mark_price,
                    "value_usdt": float(qty * mark_price),
                }
            )
            if position is not None:
                open_positions.append(
                    {
                        "symbol": sym,
                        "quantity": qty,
                        "entry_price": entry_price,
                        "last_price": mark_price,
                        "unrealized_pnl": unrealized_pnl,
                    }
                )
        primary_holding = holdings_by_symbol[0] if holdings_by_symbol else None

        average_holding_time_seconds = _compute_average_holding_seconds(trades)
        average_holding_time_minutes = average_holding_time_seconds / 60.0 if average_holding_time_seconds > 0 else 0.0
        total_duration_seconds = (
            max(0.0, float((last_processed_ts - first_processed_ts) / 1000.0))
            if first_processed_ts is not None and last_processed_ts is not None and last_processed_ts >= first_processed_ts
            else 0.0
        )
        exposure_time_seconds = float(exposure_time_ms / 1000.0)
        exposure_time_percent = (
            float((exposure_time_seconds / total_duration_seconds) * 100.0)
            if total_duration_seconds > 0
            else 0.0
        )
        time_in_market_percent = (
            float((candles_with_position / total_candles_processed) * 100.0)
            if total_candles_processed > 0
            else 0.0
        )
        average_capital_utilization_percent = (
            float(capital_utilization_sum / capital_utilization_points)
            if capital_utilization_points > 0
            else 0.0
        )
        portfolio_summary = {
            "final_cash_balance": float(balance),
            "final_asset_holdings": primary_holding,
            "final_asset_holdings_by_symbol": holdings_by_symbol,
            "average_holding_time_seconds": float(average_holding_time_seconds),
            "average_holding_time_minutes": float(average_holding_time_minutes),
            "exposure_time_seconds": float(exposure_time_seconds),
            "exposure_time_percent": float(exposure_time_percent),
            "time_in_market_percent": float(time_in_market_percent),
            "average_capital_utilization_percent": float(average_capital_utilization_percent),
        }

        analysis = calculate_metrics(
            equity_curve=equity_curve,
            trades=trades,
            initial_balance=float(initial_balance),
            timeframe=timeframe,
            risk_free_rate=0.0,
        )
        primary_symbol = symbols[0]
        primary_candles = symbol_candles.get(primary_symbol, [])
        return {
            "exchange": exchange,
            "symbols": symbols,
            "fee_rate": float(final_fee_rate),
            "config_used": config_used,
            "initial_balance": float(initial_balance),
            "cash_balance": float(balance),
            "final_balance": float(final_equity),
            "final_equity": float(final_equity),
            "realized_pnl": float(realized_pnl),
            "unrealized_pnl": float(final_unrealized_pnl),
            "total_pnl": float(realized_pnl + final_unrealized_pnl),
            "total_return_usdt": float(total_return_usdt),
            "total_return_percent": float(total_return_percent),
            "max_drawdown_percent": float(max_dd * 100.0),
            "win_rate_percent": float(win_rate_percent),
            "profit_factor": float(profit_factor),
            "total_trades": int(total_trades),
            "candles_count": int(len(primary_candles)),
            "candles_start_ts": first_ts,
            "candles_end_ts": last_ts,
            "candles": primary_candles,
            "candles_by_symbol": symbol_candles,
            "equity_curve": equity_curve,
            "trades": trades,
            "order_events": order_events,
            "analysis": analysis,
            "open_positions": open_positions,
            "portfolio_summary": portfolio_summary,
            "open_positions_at_end": int(open_positions_at_end),
            "had_forced_close": False,
        }

    if progress_callback:
        progress_callback(30)

    source_timeframe = "1m" if timeframe in SUB_MINUTE_TIMEFRAMES else timeframe

    candles_raw = client.fetch_candles(
        symbol=symbol,
        timeframe=source_timeframe,
        start_date=start_date,
        end_date=end_date,
    )

    if not candles_raw:
        raise Exception("No candles returned for the selected period.")

    # ============================
    # NORMALIZE CANDLES (for UI + engine)
    # ============================
    candles = []
    first_ts = None
    last_ts = None

    for c in candles_raw:
        candle = {
            "open": float(c[1]),
            "high": float(c[2]),
            "low": float(c[3]),
            "close": float(c[4]),
            "volume": float(c[5]),
            "timestamp": int(c[0]),
        }
        candles.append(candle)
        if first_ts is None:
            first_ts = candle["timestamp"]
        last_ts = candle["timestamp"]

    if timeframe in SUB_MINUTE_TIMEFRAMES:
        candles = expand_minute_candles_to_subminute(candles, timeframe)
        if candles:
            first_ts = int(candles[0]["timestamp"])
            last_ts = int(candles[-1]["timestamp"])

    # ============================
    # INDICATORS
    # ============================
    indicator_series = compute_indicator_series(candles, config)

    # ============================
    # STATE
    # ============================
    balance = float(initial_balance)
    max_exposure_pct = float(getattr(config, "max_account_exposure_pct", 100.0))

    position = None
    trades = []
    equity_curve = []
    pending_orders: list[dict[str, Any]] = []
    order_events: list[dict[str, Any]] = []
    realized_pnl = 0.0

    peak_equity = balance
    max_dd = 0.0

    last_exit_ts: Optional[int] = None
    reentry_blocked = False  # if allow_reentry False, require HOLD after close

    wins = []
    losses = []
    exposure_time_ms = 0.0
    exposure_open_ts: Optional[int] = None
    previous_has_position = False
    candles_with_position = 0
    total_candles_processed = 0
    capital_utilization_sum = 0.0
    capital_utilization_points = 0
    first_processed_ts: Optional[int] = None
    last_processed_ts: Optional[int] = None

    history_window = max(
        int(getattr(config, "min_bars", 1)),
        int(getattr(config, "lookback_window", 1)),
        int(getattr(config, "volume_window", 1)),
        int(getattr(config, "volatility_window", 1)),
        int(getattr(config, "fast_ma_window", 1)),
        int(getattr(config, "slow_ma_window", 1)),
        int(getattr(config, "rsi_window", 1)),
    ) + 5

    if progress_callback:
        progress_callback(55)
    # ============================
    # LOOP
    # ============================
    total = max(len(candles), 1)

    for i in range(len(candles)):
        progress_pct = max(int((i / total) * 100), 55)

        if progress_callback:
            progress_callback(progress_pct)

        candle = candles[i]
        ts = int(candle["timestamp"])
        if first_processed_ts is None:
            first_processed_ts = ts
        last_processed_ts = ts
        low = float(candle["low"])
        high = float(candle["high"])

        # Execution price:
        # - same_close: execute on candle close
        # - next_open: execute on next candle open (more realistic)
        if execution_model == "same_close":
            exec_price = float(candle["close"])
        else:
            if i + 1 < len(candles):
                exec_price = float(candles[i + 1]["open"])
            else:
                exec_price = float(candle["close"])

        # Update trailing trackers intrabar (use high/low)
        if position is not None:
            if position["side"] == "LONG":
                position["max_price"] = max(float(position.get("max_price", position["entry_price"])), float(candle["high"]))
            else:
                position["min_price"] = min(float(position.get("min_price", position["entry_price"])), float(candle["low"]))

        position_for_ctx = _position_with_fee_metrics(
            position=position,
            mark_price=float(candle["close"]),
        )

        current_prices_for_valuation = {}
        if position is not None:
            current_prices_for_valuation[symbol] = float(candle["close"])
        equity_for_ctx, unreal_for_ctx = _compute_portfolio_valuation(
            positions_by_symbol={symbol: position},
            last_prices=current_prices_for_valuation,
            cash_balance=balance,
        )
        current_exposure_pct = (
            (float(position.get("entry_notional", 0.0)) / max(equity_for_ctx, 1e-12)) * 100.0
            if position is not None and equity_for_ctx > 0
            else 0.0
        )

        ctx = build_context(
            index=i,
            candles=candles,
            indicator_series=indicator_series,
            position=position_for_ctx,
            balance=balance,
            initial_balance=float(initial_balance),
            timeframe=timeframe,
            history_window=history_window,
            exchange=exchange,
            symbol=symbol,
            fee_rate=float(final_fee_rate),
            slippage_bps=float(getattr(config, "slippage_bps", 0.0)),
            realized_pnl=float(realized_pnl),
            unrealized_pnl=float(unreal_for_ctx),
            equity=float(equity_for_ctx),
            cash_balance=float(balance),
            exposure_pct=float(current_exposure_pct),
            open_positions=1 if position else 0,
            current_drawdown_pct=float(max_dd * 100.0),
            execution_model=str(getattr(config, "execution_model", "next_open")),
            stop_fill_model=str(getattr(config, "stop_fill_model", "stop_price")),
            leverage=float(getattr(config, "leverage", 1.0)),
            margin_mode=str(getattr(config, "margin_mode", "isolated")),
            params=dict(getattr(config, "params", {}) or {}),
            open_orders=[
                {
                    "id": str(order["id"]),
                    "symbol": symbol,
                    "side": str(order["side"]),
                    "order_type": str(order["order_type"]),
                    "price": order.get("price"),
                    "stop_price": order.get("stop_price"),
                    "quantity": order.get("quantity"),
                    "status": str(order.get("status", "pending")),
                    "created_at": int(order.get("created_at", ts)),
                    "filled_at": order.get("filled_at"),
                }
                for order in pending_orders
                if str(order.get("status", "pending")) == "pending"
            ],
        )

        # Warmup
        if i < min_bars:
            intent = "HOLD"
        else:
            raw_signal = generate_signal(ctx)
            structured_order = _normalize_order_instruction(raw_signal)
            if structured_order is not None:
                action = str(structured_order["action"])
                order_type = str(structured_order["order_type"])
                if action in ("BUY", "SELL", "CLOSE"):
                    order = {
                        "id": str(uuid4()),
                        "symbol": symbol,
                        "side": "SELL" if action == "CLOSE" else action,
                        "order_type": order_type,
                        "price": structured_order.get("price"),
                        "stop_price": structured_order.get("stop_price"),
                        "quantity": structured_order.get("quantity"),
                        "size_pct": structured_order.get("size_pct"),
                        "reduce_only": bool(structured_order.get("reduce_only", False)),
                        "status": "pending",
                        "created_at": ts,
                        "filled_at": None,
                        "triggered": False,
                    }

                    needs_price = order_type in {"limit", "stop_limit"}
                    needs_stop = order_type in {"stop", "stop_limit"}
                    if needs_price and order.get("price") is None:
                        order["status"] = "cancelled"
                        order_events.append(
                            {
                                "event_type": "order_cancelled",
                                "reason": "missing_price",
                                **order,
                            }
                        )
                    elif needs_stop and order.get("stop_price") is None:
                        order["status"] = "cancelled"
                        order_events.append(
                            {
                                "event_type": "order_cancelled",
                                "reason": "missing_stop_price",
                                **order,
                            }
                        )
                    else:
                        pending_orders.append(order)
                        order_events.append({"event_type": "order_created", **order})
                    intent = "HOLD"
                else:
                    intent = "HOLD"
            else:
                # Support your validator’s ALLOWED_RETURN_VALUES, but normalize anyway
                # (So user algos can return BUY/SELL/HOLD or LONG/SHORT/CLOSE/HOLD)
                # If validator restricts, it should allow at least BUY/SELL/HOLD or LONG/SHORT/CLOSE/HOLD.
                if raw_signal not in ALLOWED_RETURN_VALUES and str(raw_signal).upper() not in ("LONG", "SHORT", "CLOSE"):
                    raise Exception(f"Invalid signal '{raw_signal}'. Allowed: {ALLOWED_RETURN_VALUES} (+ LONG/SHORT/CLOSE).")

                intent = _normalize_signal(str(raw_signal), direction)

        # Evaluate pending orders with current candle range.
        still_pending: list[dict[str, Any]] = []
        for order in pending_orders:
            if str(order.get("status", "pending")) != "pending":
                continue

            side = str(order.get("side", "BUY")).upper()
            order_type = str(order.get("order_type", "market")).lower()
            limit_price = float(order["price"]) if order.get("price") is not None else None
            stop_price = float(order["stop_price"]) if order.get("stop_price") is not None else None
            fill_now = False
            fill_price = float(exec_price)

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
                    fill_price = float(exec_price)
                elif side == "SELL" and stop_price is not None and low <= stop_price:
                    fill_now = True
                    fill_price = float(exec_price)
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

            size_pct = float(order["size_pct"]) if order.get("size_pct") is not None else None
            size_qty = float(order["quantity"]) if order.get("quantity") is not None else None
            executed = False

            if side == "BUY":
                dynamic_max_allowed_capital = max(
                    0.0,
                    float(balance) * (max_exposure_pct / 100.0),
                )
                if position is None:
                    opened = _open_position(
                        desired_side="LONG",
                        balance=balance,
                        max_allowed_capital=dynamic_max_allowed_capital,
                        entry_price=float(fill_price),
                        timestamp=ts,
                        fee_rate=float(final_fee_rate),
                        config=config,
                        size_pct=size_pct,
                        size_qty=size_qty,
                    )
                    if opened is None:
                        order["status"] = "cancelled"
                        order_events.append(
                            {
                                "event_type": "order_cancelled",
                                "reason": "open_rejected",
                                **order,
                            }
                        )
                    else:
                        position = opened
                        executed = True
                elif position["side"] == "LONG":
                    added = _add_to_position(
                        position=position,
                        balance=balance,
                        max_allowed_capital=dynamic_max_allowed_capital,
                        price=float(fill_price),
                        timestamp=ts,
                        fee_rate=float(final_fee_rate),
                        config=config,
                        size_pct=size_pct,
                        size_qty=size_qty,
                    )
                    if added is None:
                        order["status"] = "cancelled"
                        order_events.append(
                            {
                                "event_type": "order_cancelled",
                                "reason": "add_rejected",
                                **order,
                            }
                        )
                    else:
                        position = added
                        executed = True
                else:
                    order["status"] = "cancelled"
                    order_events.append(
                        {
                            "event_type": "order_cancelled",
                            "reason": "opposite_position_open",
                            **order,
                        }
                    )
            else:
                if position is not None:
                    trade, pnl = _close_position(
                        position=position,
                        exit_price=float(fill_price),
                        timestamp=ts,
                        fee_rate=float(final_fee_rate),
                        config=config,
                    )
                    trades.append(trade)
                    balance += pnl
                    realized_pnl += float(pnl)
                    (wins if pnl > 0 else losses).append(pnl)
                    position = None
                    last_exit_ts = ts
                    if not allow_reentry:
                        reentry_blocked = True
                    executed = True
                else:
                    order["status"] = "cancelled"
                    order_events.append(
                        {
                            "event_type": "order_cancelled",
                            "reason": "no_position_to_close",
                            **order,
                        }
                    )

            if executed:
                order["status"] = "filled"
                order["filled_at"] = ts
                order_events.append({"event_type": "order_filled", **order})
            elif str(order.get("status")) != "cancelled":
                still_pending.append(order)

        pending_orders = still_pending

        # allow_reentry False: a HOLD unlocks the next entry
        if not allow_reentry and intent == "HOLD":
            reentry_blocked = False

        # Cooldown gating helper
        def _cooldown_ok() -> bool:
            if cooldown_seconds <= 0:
                return True
            if last_exit_ts is None:
                return True
            return (ts - last_exit_ts) >= cooldown_seconds * 1000

        # =====================================================
        # 1) Risk exits (intrabar): SL/TP/Trailing
        # =====================================================
        if position is not None:
            hit, fill_price = _check_intrabar_risk_exit(position, candle, config)
            if hit and fill_price is not None:
                trade, pnl = _close_position(
                    position=position,
                    exit_price=float(fill_price),
                    timestamp=ts,
                    fee_rate=float(final_fee_rate),
                    config=config,
                )
                trades.append(trade)
                balance += pnl
                realized_pnl += float(pnl)

                (wins if pnl > 0 else losses).append(pnl)

                position = None
                last_exit_ts = ts
                if not allow_reentry:
                    reentry_blocked = True

        # =====================================================
        # 2) Intent handling: CLOSE / LONG / SHORT
        # =====================================================
        if intent == "CLOSE":
            if position is not None:
                trade, pnl = _close_position(
                    position=position,
                    exit_price=float(exec_price),
                    timestamp=ts,
                    fee_rate=float(final_fee_rate),
                    config=config,
                )
                trades.append(trade)
                balance += pnl
                realized_pnl += float(pnl)
                (wins if pnl > 0 else losses).append(pnl)

                position = None
                last_exit_ts = ts
                if not allow_reentry:
                    reentry_blocked = True

        elif intent in ("LONG", "SHORT"):
            # direction constraint
            if direction == "long_only" and intent == "SHORT":
                # ignore shorts completely
                pass
            else:
                # allow_reentry gating
                if not allow_reentry and reentry_blocked:
                    pass
                elif not _cooldown_ok():
                    pass
                else:
                    if position is None:
                        dynamic_max_allowed_capital = max(
                            0.0,
                            float(balance) * (max_exposure_pct / 100.0),
                        )
                        position = _open_position(
                            desired_side=intent,
                            balance=balance,
                            max_allowed_capital=dynamic_max_allowed_capital,
                            entry_price=float(exec_price),
                            timestamp=ts,
                            fee_rate=float(final_fee_rate),
                            config=config,
                        )
                    else:
                        # scale in if same side
                        if position["side"] == intent:
                            dynamic_max_allowed_capital = max(
                                0.0,
                                float(balance) * (max_exposure_pct / 100.0),
                            )
                            added = _add_to_position(
                                position=position,
                                balance=balance,
                                max_allowed_capital=dynamic_max_allowed_capital,
                                price=float(exec_price),
                                timestamp=ts,
                                fee_rate=float(final_fee_rate),
                                config=config,
                            )
                            if added is not None:
                                position = added
                        # flip if opposite
                        else:
                            trade, pnl = _close_position(
                                position=position,
                                exit_price=float(exec_price),
                                timestamp=ts,
                                fee_rate=float(final_fee_rate),
                                config=config,
                            )
                            trades.append(trade)
                            balance += pnl
                            realized_pnl += float(pnl)
                            (wins if pnl > 0 else losses).append(pnl)

                            position = None
                            last_exit_ts = ts
                            if not allow_reentry:
                                reentry_blocked = True

                            # If reentry allowed, attempt immediate flip open (common in long_short)
                            if allow_reentry and _cooldown_ok():
                                dynamic_max_allowed_capital = max(
                                    0.0,
                                    float(balance) * (max_exposure_pct / 100.0),
                                )
                                position = _open_position(
                                    desired_side=intent,
                                    balance=balance,
                                    max_allowed_capital=dynamic_max_allowed_capital,
                                    entry_price=float(exec_price),
                                    timestamp=ts,
                                    fee_rate=float(final_fee_rate),
                                    config=config,
                                )

        # =====================================================
        # 3) Equity curve
        # =====================================================
        equity, _ = _compute_portfolio_valuation(
            positions_by_symbol={symbol: position},
            last_prices={symbol: float(candle["close"])} if position is not None else {},
            cash_balance=balance,
        )
        current_has_position = position is not None
        if current_has_position and not previous_has_position:
            exposure_open_ts = ts
        elif (not current_has_position) and previous_has_position and exposure_open_ts is not None:
            exposure_time_ms += max(0.0, float(ts - exposure_open_ts))
            exposure_open_ts = None
        previous_has_position = current_has_position

        total_candles_processed += 1
        if current_has_position:
            candles_with_position += 1
        capital_deployed = _compute_capital_deployed(
            positions_by_symbol={symbol: position},
            last_prices={symbol: float(candle["close"])} if position is not None else {},
        )
        if equity > 0:
            capital_utilization_sum += float((capital_deployed / equity) * 100.0)
            capital_utilization_points += 1

        # liquidation safeguard
        if equity <= 0:
            break

        equity_curve.append({"timestamp": ts, "equity": float(equity)})

        if equity > peak_equity:
            peak_equity = equity

        dd = (peak_equity - equity) / peak_equity if peak_equity else 0.0
        max_dd = max(max_dd, dd)

        if getattr(config, "max_drawdown_pct", None) is not None:
            if (dd * 100.0) >= float(config.max_drawdown_pct):
                break
    
    open_positions_at_end = 1 if position is not None else 0
    if previous_has_position and exposure_open_ts is not None:
        end_ts_for_exposure = int(last_processed_ts if last_processed_ts is not None else (candles[-1]["timestamp"] if candles else 0))
        exposure_time_ms += max(0.0, float(end_ts_for_exposure - exposure_open_ts))
        exposure_open_ts = None

    final_mark_price = float(candles[-1]["close"]) if candles else 0.0
    final_equity, final_unrealized_pnl = _compute_portfolio_valuation(
        positions_by_symbol={symbol: position},
        last_prices={symbol: final_mark_price} if position is not None else {},
        cash_balance=balance,
    )
    if equity_curve and candles:
        equity_curve[-1]["equity"] = float(final_equity)
    elif candles:
        equity_curve.append({
            "timestamp": int(candles[-1]["timestamp"]),
            "equity": float(final_equity),
        })

    # ============================
    # FINAL METRICS
    # ============================
    total_return_usdt = final_equity - float(initial_balance)
    total_return_percent = (total_return_usdt / float(initial_balance)) * 100.0 if initial_balance else 0.0

    total_trades = len(trades)
    win_rate_percent = (len([x for x in wins if x > 0]) / total_trades * 100.0) if total_trades else 0.0

    total_wins = float(sum([x for x in wins if x > 0]))
    total_losses = float(abs(sum([x for x in losses if x < 0]))) if losses else 0.0
    profit_factor = (total_wins / total_losses) if total_losses > 0 else 0.0

    open_positions = []
    qty = float(position.get("quantity", 0.0)) if position is not None else 0.0
    entry_price = float(position.get("average_entry_price", position.get("entry_price", 0.0))) if position is not None else 0.0
    cost_basis = float(position.get("entry_notional", entry_price * qty)) if position is not None else 0.0
    final_holding = {
        "symbol": symbol,
        "base_asset": _derive_base_asset(symbol),
        "quantity": qty,
        "last_price": float(final_mark_price),
        "value_usdt": float(qty * float(final_mark_price)),
    }
    if position is not None:
        open_positions.append(
            {
                "symbol": symbol,
                "quantity": qty,
                "entry_price": entry_price,
                "last_price": float(final_mark_price),
                "unrealized_pnl": float((qty * float(final_mark_price)) - cost_basis),
            }
        )

    average_holding_time_seconds = _compute_average_holding_seconds(trades)
    average_holding_time_minutes = average_holding_time_seconds / 60.0 if average_holding_time_seconds > 0 else 0.0
    total_duration_seconds = (
        max(0.0, float((last_processed_ts - first_processed_ts) / 1000.0))
        if first_processed_ts is not None and last_processed_ts is not None and last_processed_ts >= first_processed_ts
        else 0.0
    )
    exposure_time_seconds = float(exposure_time_ms / 1000.0)
    exposure_time_percent = (
        float((exposure_time_seconds / total_duration_seconds) * 100.0)
        if total_duration_seconds > 0
        else 0.0
    )
    time_in_market_percent = (
        float((candles_with_position / total_candles_processed) * 100.0)
        if total_candles_processed > 0
        else 0.0
    )
    average_capital_utilization_percent = (
        float(capital_utilization_sum / capital_utilization_points)
        if capital_utilization_points > 0
        else 0.0
    )
    portfolio_summary = {
        "final_cash_balance": float(balance),
        "final_asset_holdings": final_holding,
        "final_asset_holdings_by_symbol": [final_holding],
        "average_holding_time_seconds": float(average_holding_time_seconds),
        "average_holding_time_minutes": float(average_holding_time_minutes),
        "exposure_time_seconds": float(exposure_time_seconds),
        "exposure_time_percent": float(exposure_time_percent),
        "time_in_market_percent": float(time_in_market_percent),
        "average_capital_utilization_percent": float(average_capital_utilization_percent),
    }

    analysis = calculate_metrics(
        equity_curve=equity_curve,
        trades=trades,
        initial_balance=float(initial_balance),
        timeframe=timeframe,
        risk_free_rate=0.0,
    )

    return {
        "exchange": exchange,
        "symbols": [symbol],
        "fee_rate": float(final_fee_rate),
        "config_used": config_used,

        "initial_balance": float(initial_balance),
        "cash_balance": float(balance),
        "final_balance": float(final_equity),
        "final_equity": float(final_equity),
        "realized_pnl": float(realized_pnl),
        "unrealized_pnl": float(final_unrealized_pnl),
        "total_pnl": float(realized_pnl + final_unrealized_pnl),

        "total_return_usdt": float(total_return_usdt),
        "total_return_percent": float(total_return_percent),
        "max_drawdown_percent": float(max_dd * 100.0),
        "win_rate_percent": float(win_rate_percent),
        "profit_factor": float(profit_factor),
        "total_trades": int(total_trades),

        # IMPORTANT for UI candles chart
        "candles_count": int(len(candles)),
        "candles_start_ts": first_ts,
        "candles_end_ts": last_ts,
        "candles": candles,

        "equity_curve": equity_curve,
        "trades": trades,
        "order_events": order_events,
        "open_orders_at_end": [
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
            for order in pending_orders
            if str(order.get("status", "pending")) == "pending"
        ],
        "analysis": analysis,
        "open_positions": open_positions,
        "portfolio_summary": portfolio_summary,

        "open_positions_at_end": int(open_positions_at_end),
        "had_forced_close": False,
    }
