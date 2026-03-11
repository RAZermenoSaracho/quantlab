CONFIG = {
    "spec_version": 2,
    "direction": "long_only",
    "batch_size_type": "percent_balance",
    "batch_size": 95.0,
    "max_account_exposure_pct": 95.0,
    "max_open_positions": 1,
    "cooldown_seconds": 0,
    "allow_reentry": True,
    "execution_model": "next_open",
    "stop_fill_model": "stop_price",
    "slippage_bps": 3.0,
    "min_bars": 30,
    "lookback_window": 20,
    "volume_window": 20,
    "volatility_window": 20,
    "fast_ma_window": 10,
    "slow_ma_window": 30,
    "rsi_window": 14,
    "params": {
        "return_thresh": 0.0000,
        "volume_low": -3.0,
        "volume_high": 3.0,
        "entry_size_pct": 95.0,
        "min_edge_bps": 8.0
    }
}


def _to_float(value, default=0.0):
    try:
        return float(value)
    except:
        return float(default)


def _has_open_position(ctx):
    position = ctx.get("position")
    try:
        return position is not None and _to_float(position.get("quantity", 0.0)) > 0
    except:
        return False


def _get_position(ctx):
    position = ctx.get("position")
    try:
        position.get("quantity")
        return position
    except:
        return None


def _log_ratio(a, b):
    if a <= 0 or b <= 0:
        return 0.0
    value = math.log(a / b)
    if math.isnan(value) or not math.isfinite(value):
        return 0.0
    return float(value)


def _latest_complete_closes_and_volumes(history):
    closes = []
    volumes = []

    for candle in history:
        try:
            closes.append(_to_float(candle.get("close", 0.0)))
            volumes.append(_to_float(candle.get("volume", 0.0)))
        except:
            pass

    return closes, volumes


def _between(value, low, high):
    return value >= low and value <= high


def _round_trip_cost_pct(ctx):
    fee_rate = max(0.0, _to_float(ctx.get("fee_rate", 0.0)))
    slippage_bps = max(0.0, _to_float(ctx.get("slippage_bps", 0.0)))
    return (fee_rate * 2.0 * 100.0) + ((slippage_bps * 2.0) / 100.0)


def generate_signal(ctx):
    history = list(ctx.get("history", ()))
    if len(history) < 3:
        return "HOLD"

    open_orders = ctx.get("open_orders", [])
    try:
        if len(open_orders) > 0:
            return "HOLD"
    except:
        pass

    params = ctx.get("params", {}) or {}

    return_thresh = _to_float(params.get("return_thresh", 0.0), 0.0)
    volume_low = _to_float(params.get("volume_low", -3.0), -3.0)
    volume_high = _to_float(params.get("volume_high", 3.0), 3.0)
    entry_size_pct = _to_float(params.get("entry_size_pct", 95.0), 95.0)
    min_edge_bps = _to_float(params.get("min_edge_bps", 8.0), 8.0)

    closes, volumes = _latest_complete_closes_and_volumes(history)
    if len(closes) < 2 or len(volumes) < 2:
        return "HOLD"

    last_close = closes[-1]
    prev_close = closes[-2]
    last_volume = volumes[-1]
    prev_volume = volumes[-2]

    if last_close <= 0 or prev_close <= 0 or last_volume <= 0 or prev_volume <= 0:
        return "HOLD"

    bar_return = _log_ratio(last_close, prev_close)
    vol_change = _log_ratio(last_volume, prev_volume)

    if vol_change > 3.0 or vol_change < -3.0:
        return "HOLD"

    exit_signal = (bar_return >= return_thresh) and _between(vol_change, volume_low, volume_high)

    position = _get_position(ctx)
    in_position = _has_open_position(ctx)

    # If flat, default behavior is to stay invested / re-enter long.
    if not in_position:
        exposure_pct = _to_float(ctx.get("exposure_pct", 0.0), 0.0)
        max_exposure_pct = _to_float(
            params.get("entry_size_pct", entry_size_pct),
            entry_size_pct,
        )

        headroom = max(0.0, max_exposure_pct - exposure_pct)
        if headroom <= 0.25:
            return "HOLD"

        size_pct = headroom if headroom < entry_size_pct else entry_size_pct
        if size_pct <= 0:
            return "HOLD"

        return {
            "action": "BUY",
            "order_type": "market",
            "size_pct": size_pct,
        }

    entry_price = _to_float(
        position.get("average_entry_price", position.get("entry_price", 0.0)),
        0.0,
    )
    if entry_price <= 0:
        return "HOLD"

    gross_open_profit_pct = ((last_close - entry_price) / entry_price) * 100.0
    cost_pct = _round_trip_cost_pct(ctx)
    required_profit_pct = max(cost_pct, min_edge_bps / 100.0)

    # Go neutral only if the original signal says so and there is enough edge after fees/slippage.
    if exit_signal and gross_open_profit_pct >= required_profit_pct:
        return {
            "action": "SELL",
            "order_type": "market",
            "reduce_only": True,
        }

    return "HOLD"