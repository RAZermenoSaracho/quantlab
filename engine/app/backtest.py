from typing import Optional, Tuple, Dict, Any

from .validator import SAFE_GLOBALS, ALLOWED_RETURN_VALUES
from .metrics import calculate_metrics
from .clients import ExchangeFactory
from .spec import load_config_from_env

from .indicators import compute_indicator_series
from .context import build_context


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


# ============================================================
# Position management
# ============================================================

def _open_position(
    desired_side: str,          # "LONG" | "SHORT"
    balance: float,
    max_allowed_capital: float,
    entry_price: float,
    timestamp: int,
    config,
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

    if getattr(config, "batch_size_type", "fixed") == "fixed":
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

    return {
        "side": desired_side,          # LONG | SHORT
        "entry_price": float(fill_price),
        "quantity": float(qty),
        "opened_at": int(timestamp),
        # trailing tracking (intrabar)
        "max_price": float(fill_price),  # used for LONG
        "min_price": float(fill_price),  # used for SHORT
    }


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
    entry = float(position["entry_price"])
    qty = float(position["quantity"])

    slippage_bps = float(getattr(config, "slippage_bps", 0.0))

    exit_order_side = "SELL" if side == "LONG" else "BUY"
    fill_exit = _apply_slippage(float(exit_price), slippage_bps, side=exit_order_side)

    if side == "LONG":
        gross = (fill_exit - entry) * qty
    else:
        gross = (entry - fill_exit) * qty

    fee = (entry * qty * float(fee_rate)) + (fill_exit * qty * float(fee_rate))
    net = gross - fee

    trade = {
        "side": side,  # LONG | SHORT
        "entry_price": float(entry),
        "exit_price": float(fill_exit),
        "gross_pnl": float(gross),
        "net_pnl": float(net),
        "fee": float(fee),
        "quantity": float(qty),
        "opened_at": int(position["opened_at"]),
        "closed_at": int(timestamp),
        "duration_ms": int(timestamp) - int(position["opened_at"]),
    }

    return trade, float(net)


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
) -> dict:

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

    candles_raw = client.fetch_candles(
        symbol=symbol,
        timeframe=timeframe,
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

    # ============================
    # INDICATORS
    # ============================
    indicator_series = compute_indicator_series(candles, config)

    # ============================
    # STATE
    # ============================
    balance = float(initial_balance)
    max_allowed_capital = float(initial_balance) * (float(getattr(config, "max_account_exposure_pct", 100.0)) / 100.0)

    position = None
    trades = []
    equity_curve = []

    peak_equity = balance
    max_dd = 0.0

    last_exit_ts: Optional[int] = None
    reentry_blocked = False  # if allow_reentry False, require HOLD after close

    wins = []
    losses = []

    history_window = max(
        int(getattr(config, "min_bars", 1)),
        int(getattr(config, "lookback_window", 1)),
        int(getattr(config, "volume_window", 1)),
        int(getattr(config, "volatility_window", 1)),
        int(getattr(config, "fast_ma_window", 1)),
        int(getattr(config, "slow_ma_window", 1)),
        int(getattr(config, "rsi_window", 1)),
    ) + 5

    # ============================
    # LOOP
    # ============================
    for i in range(len(candles)):
        candle = candles[i]
        ts = int(candle["timestamp"])

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

        ctx = build_context(
            index=i,
            candles=candles,
            indicator_series=indicator_series,
            position=position,
            balance=balance,
            initial_balance=float(initial_balance),
            timeframe=timeframe,
            history_window=history_window,
        )

        # Warmup
        if i < min_bars:
            intent = "HOLD"
        else:
            raw_signal = generate_signal(ctx)

            # Support your validator’s ALLOWED_RETURN_VALUES, but normalize anyway
            # (So user algos can return BUY/SELL/HOLD or LONG/SHORT/CLOSE/HOLD)
            # If validator restricts, it should allow at least BUY/SELL/HOLD or LONG/SHORT/CLOSE/HOLD.
            if raw_signal not in ALLOWED_RETURN_VALUES and str(raw_signal).upper() not in ("LONG", "SHORT", "CLOSE"):
                raise Exception(f"Invalid signal '{raw_signal}'. Allowed: {ALLOWED_RETURN_VALUES} (+ LONG/SHORT/CLOSE).")

            intent = _normalize_signal(str(raw_signal), direction)

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
                        position = _open_position(
                            desired_side=intent,
                            balance=balance,
                            max_allowed_capital=max_allowed_capital,
                            entry_price=float(exec_price),
                            timestamp=ts,
                            config=config,
                        )
                    else:
                        # flip if opposite
                        if position["side"] != intent:
                            trade, pnl = _close_position(
                                position=position,
                                exit_price=float(exec_price),
                                timestamp=ts,
                                fee_rate=float(final_fee_rate),
                                config=config,
                            )
                            trades.append(trade)
                            balance += pnl
                            (wins if pnl > 0 else losses).append(pnl)

                            position = None
                            last_exit_ts = ts
                            if not allow_reentry:
                                reentry_blocked = True

                            # If reentry allowed, attempt immediate flip open (common in long_short)
                            if allow_reentry and _cooldown_ok():
                                position = _open_position(
                                    desired_side=intent,
                                    balance=balance,
                                    max_allowed_capital=max_allowed_capital,
                                    entry_price=float(exec_price),
                                    timestamp=ts,
                                    config=config,
                                )

        # =====================================================
        # 3) Equity curve
        # =====================================================
        if position is not None:
            unreal = _unrealized_pnl(
                price=float(candle["close"]),
                entry=float(position["entry_price"]),
                qty=float(position["quantity"]),
                side=str(position["side"]),
            )
            equity = balance + unreal
        else:
            equity = balance

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

    # ============================
    # FINAL METRICS
    # ============================
    total_return_usdt = balance - float(initial_balance)
    total_return_percent = (total_return_usdt / float(initial_balance)) * 100.0 if initial_balance else 0.0

    total_trades = len(trades)
    win_rate_percent = (len([x for x in wins if x > 0]) / total_trades * 100.0) if total_trades else 0.0

    total_wins = float(sum([x for x in wins if x > 0]))
    total_losses = float(abs(sum([x for x in losses if x < 0]))) if losses else 0.0
    profit_factor = (total_wins / total_losses) if total_losses > 0 else 0.0

    analysis = calculate_metrics(
        equity_curve=equity_curve,
        trades=trades,
        initial_balance=float(initial_balance),
        timeframe=timeframe,
        risk_free_rate=0.0,
    )

    return {
        "exchange": exchange,
        "fee_rate": float(final_fee_rate),
        "config_used": config_used,

        "initial_balance": float(initial_balance),
        "final_balance": float(balance),

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
        "analysis": analysis,
    }
