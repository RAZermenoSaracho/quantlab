CONFIG = {
    "spec_version": 2,
    "direction": "long_only",
    "batch_size_type": "percent_balance",
    "batch_size": 100.0,
    "max_account_exposure_pct": 100.0,
    "max_open_positions": 1,
    "cooldown_seconds": 0,
    "allow_reentry": False,
    "execution_model": "next_open",
    "stop_fill_model": "stop_price",
    "slippage_bps": 0.0,
    "lookback_window": 1,
    "min_bars": 1,
    "params": {}
}


def generate_signal(ctx):
    """
    Buy once and hold forever.
    """

    # Check if position already exists
    position = ctx.get("position")

    if position is None:
        return {
            "action": "BUY",
            "order_type": "market",
            "size_pct": 100
        }

    return "HOLD"