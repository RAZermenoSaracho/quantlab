CONFIG = {
    "spec_version": 2,
    "direction": "long_only",
    "batch_size_type": "percent_balance",
    "batch_size": 8.0,
    "max_account_exposure_pct": 90.0,
    "max_open_positions": 1,
    "cooldown_seconds": 0,
    "allow_reentry": True,
    "execution_model": "next_open",
    "stop_fill_model": "stop_price",
    "slippage_bps": 4.0,
    "lookback_window": 200,
    "min_bars": 120,
    "fast_ma_window": 21,
    "slow_ma_window": 89,
    "rsi_window": 14,
    "volatility_window": 20,
    "params": {
        "ema_fast": 21,
        "ema_slow": 89,
        "rsi_period": 14,
        "rsi_buy_level": 34.0,
        "rsi_sell_level": 69.0,
        "atr_period": 14,
        "atr_min_pct": 0.20,
        "dip_threshold_pct": 1.0,
        "take_profit_pct": 1.2,
        "max_exposure_pct": 88.0,
        "base_position_pct": 58.0,
    },
}


def _to_float(value, default=0.0):
    try:
        out = float(value)
        return out
    except:
        return float(default)


def _to_int(value, default=0):
    try:
        out = int(value)
        return out
    except:
        return int(default)


def _bounded(value, lo, hi):
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def _ema(values, period):
    if not values:
        return 0.0
    p = max(1, int(period))
    alpha = 2.0 / (p + 1.0)
    ema_value = float(values[0])
    for item in values[1:]:
        ema_value = (alpha * float(item)) + ((1.0 - alpha) * ema_value)
    return float(ema_value)


def _rsi(closes, period):
    p = max(2, int(period))
    if len(closes) <= p:
        return 50.0

    gains = []
    losses = []
    start = len(closes) - p
    for i in range(start, len(closes)):
        prev_c = float(closes[i - 1])
        cur_c = float(closes[i])
        delta = cur_c - prev_c
        if delta >= 0:
            gains.append(delta)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(-delta)

    avg_gain = (sum(gains) / float(p)) if gains else 0.0
    avg_loss = (sum(losses) / float(p)) if losses else 0.0
    if avg_loss <= 1e-12:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _atr(history, period):
    p = max(2, int(period))
    if len(history) < p + 1:
        return 0.0

    trs = []
    start = len(history) - p
    for i in range(start, len(history)):
        candle = history[i]
        prev_close = float(history[i - 1]["close"])
        high = float(candle["high"])
        low = float(candle["low"])
        tr1 = high - low
        tr2 = abs(high - prev_close)
        tr3 = abs(low - prev_close)
        trs.append(max(tr1, tr2, tr3))

    if not trs:
        return 0.0
    return float(sum(trs) / float(len(trs)))


def _position_from_ctx(ctx):
    position = ctx.get("position")
    try:
        position.get("entry_price")
        return position
    except:
        pass

    symbol = str(ctx.get("symbol", ""))
    positions = ctx.get("positions", {})
    try:
        candidate = positions.get(symbol)
    except:
        candidate = None
    try:
        candidate.get("entry_price")
        return candidate
    except:
        pass

    return None


def generate_signal(ctx):
    candle = ctx.get("candle", {})
    close = _to_float(candle.get("close", ctx.get("close", 0.0)))
    if close <= 0:
        return "HOLD"

    history = list(ctx.get("history", ()))
    if len(history) < 40:
        return "HOLD"

    closes = []
    for item in history:
        try:
            closes.append(_to_float(item["close"]))
        except:
            continue
    if len(closes) < 40:
        return "HOLD"

    params = ctx.get("params", {}) or {}
    ema_fast_period = _bounded(_to_int(params.get("ema_fast", 21), 21), 5, 120)
    ema_slow_period = _bounded(_to_int(params.get("ema_slow", 89), 89), ema_fast_period + 1, 400)
    rsi_period = _bounded(_to_int(params.get("rsi_period", 14), 14), 5, 60)
    atr_period = _bounded(_to_int(params.get("atr_period", 14), 14), 5, 60)

    rsi_buy_level = _bounded(_to_float(params.get("rsi_buy_level", 34.0), 34.0), 5.0, 50.0)
    rsi_sell_level = _bounded(_to_float(params.get("rsi_sell_level", 69.0), 69.0), 50.0, 95.0)
    dip_threshold_pct = _bounded(_to_float(params.get("dip_threshold_pct", 1.0), 1.0), 0.1, 10.0)
    take_profit_pct = _bounded(_to_float(params.get("take_profit_pct", 1.2), 1.2), 0.2, 20.0)
    atr_min_pct = _bounded(_to_float(params.get("atr_min_pct", 0.20), 0.20), 0.01, 10.0)

    max_exposure_pct = _bounded(_to_float(params.get("max_exposure_pct", 88.0), 88.0), 10.0, 99.0)
    base_position_pct = _bounded(_to_float(params.get("base_position_pct", 58.0), 58.0), 5.0, max_exposure_pct)

    fee_rate = max(0.0, _to_float(ctx.get("fee_rate", 0.0), 0.0))
    slippage_bps = max(0.0, _to_float(ctx.get("slippage_bps", 0.0), 0.0))
    exposure_pct = max(0.0, _to_float(ctx.get("exposure_pct", 0.0), 0.0))

    # Keep order spam low if there are pending orders.
    open_orders = ctx.get("open_orders", [])
    try:
        open_orders_count = len(open_orders)
    except:
        open_orders_count = 0
    if open_orders_count > 0:
        return "HOLD"

    ema_fast = _ema(closes[-ema_slow_period:], ema_fast_period)
    ema_slow = _ema(closes[-ema_slow_period:], ema_slow_period)
    rsi_value = _rsi(closes, rsi_period)
    atr_value = _atr(history, atr_period)
    atr_pct = (atr_value / close) * 100.0 if close > 0 else 0.0

    trend_up = (close >= ema_slow) and (ema_fast > ema_slow)
    pullback_pct = ((ema_fast - close) / ema_fast) * 100.0 if ema_fast > 0 else 0.0
    rally_pct = ((close - ema_fast) / ema_fast) * 100.0 if ema_fast > 0 else 0.0
    dip_signal = (pullback_pct >= dip_threshold_pct) or (rsi_value <= rsi_buy_level)

    # Fee/slippage-aware minimum edge.
    round_trip_cost_pct = (fee_rate * 2.0 * 100.0) + ((slippage_bps * 2.0) / 100.0)
    min_take_profit_pct = max(take_profit_pct, round_trip_cost_pct + 0.20)

    position = _position_from_ctx(ctx)

    # Core accumulation entry when flat.
    if position is None:
        if trend_up and atr_pct >= atr_min_pct and dip_signal and exposure_pct < base_position_pct:
            target_size = min(base_position_pct - exposure_pct, max_exposure_pct - exposure_pct)
            size_pct = _bounded(target_size, 1.0, 35.0)
            return {
                "action": "BUY",
                "order_type": "market",
                "size_pct": size_pct,
            }
        return "HOLD"

    entry_price = _to_float(
        position.get("average_entry_price", position.get("entry_price", 0.0)),
        0.0,
    )
    unrealized_pct = ((close - entry_price) / entry_price) * 100.0 if entry_price > 0 else 0.0

    # Rare full exit on strong overextension with net-positive edge.
    if trend_up and rsi_value >= rsi_sell_level and rally_pct >= (dip_threshold_pct * 0.8):
        if unrealized_pct >= min_take_profit_pct:
            return {
                "action": "SELL",
                "order_type": "market",
                "reduce_only": True,
            }

    # Defensive exit when trend structure breaks and drawdown grows.
    trend_broken = (close < ema_slow) and (ema_fast < ema_slow)
    if trend_broken and unrealized_pct <= -(max(1.2, dip_threshold_pct * 1.25)):
        return {
            "action": "SELL",
            "order_type": "market",
            "reduce_only": True,
        }

    # Scale-in on pullbacks while respecting exposure cap and volatility gate.
    headroom = max_exposure_pct - exposure_pct
    if trend_up and atr_pct >= atr_min_pct and dip_signal and headroom > 0.8:
        add_size = _bounded(headroom * 0.35, 1.0, 20.0)
        return {
            "action": "BUY",
            "order_type": "market",
            "size_pct": add_size,
        }

    return "HOLD"
