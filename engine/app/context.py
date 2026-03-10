from typing import Any, Dict, List, Optional


def build_context(
    index: int,
    candles: List[dict],
    indicator_series: Dict[str, List],
    position: Optional[dict],
    balance: float,
    initial_balance: float,
    timeframe: str,
    history_window: int,
    *,
    exchange: str = "",
    symbol: str = "",
    fee_rate: float = 0.0,
    slippage_bps: float = 0.0,
    realized_pnl: float = 0.0,
    unrealized_pnl: float = 0.0,
    equity: Optional[float] = None,
    cash_balance: Optional[float] = None,
    exposure_pct: float = 0.0,
    open_positions: int = 0,
    current_drawdown_pct: float = 0.0,
    execution_model: str = "next_open",
    stop_fill_model: str = "stop_price",
    leverage: float = 1.0,
    margin_mode: str = "isolated",
    params: Optional[Dict[str, Any]] = None,
    open_orders: Optional[List[Dict[str, Any]]] = None,
) -> Dict:
    safe_equity = float(balance if equity is None else equity)
    safe_cash_balance = float(balance if cash_balance is None else cash_balance)
    safe_params = dict(params or {})
    safe_open_orders = list(open_orders or [])
    safe_position = position
    average_entry_price = (
        float(safe_position.get("average_entry_price"))
        if isinstance(safe_position, dict) and safe_position.get("average_entry_price") is not None
        else (
            float(safe_position.get("entry_price"))
            if isinstance(safe_position, dict) and safe_position.get("entry_price") is not None
            else None
        )
    )
    market_value = (
        float(safe_position.get("market_value", 0.0))
        if isinstance(safe_position, dict)
        else 0.0
    )
    entries_count = (
        int(safe_position.get("entries_count", 0))
        if isinstance(safe_position, dict)
        else 0
    )

    def _base_context(indicators: Dict[str, Any], history: tuple[dict, ...]) -> Dict[str, Any]:
        context: Dict[str, Any] = {
            "candle": candles[index],
            "history": history,
            "position": safe_position,
            "balance": float(balance),
            "cash_balance": float(safe_cash_balance),
            "initial_balance": float(initial_balance),
            "equity": float(safe_equity),
            "realized_pnl": float(realized_pnl),
            "unrealized_pnl": float(unrealized_pnl),
            "fee_rate": float(fee_rate),
            "slippage_bps": float(slippage_bps),
            "exchange": exchange,
            "symbol": symbol,
            "timeframe": timeframe,
            "indicators": indicators,
            "index": index,
            "open_positions": int(open_positions),
            "exposure_pct": float(exposure_pct),
            "average_entry_price": average_entry_price,
            "current_drawdown_pct": float(current_drawdown_pct),
            "execution_model": execution_model,
            "stop_fill_model": stop_fill_model,
            "leverage": float(leverage),
            "margin_mode": margin_mode,
            "market": {
                "exchange": exchange,
                "symbol": symbol,
                "timeframe": timeframe,
            },
            "params": safe_params,
            "open_orders": safe_open_orders,
            "portfolio": {
                "balance": float(balance),
                "cash_balance": float(safe_cash_balance),
                "equity": float(safe_equity),
                "realized_pnl": float(realized_pnl),
                "unrealized_pnl": float(unrealized_pnl),
                "open_positions": int(open_positions),
                "exposure_pct": float(exposure_pct),
                "average_entry_price": average_entry_price,
                "entries_count": int(entries_count),
                "market_value": float(market_value),
            },
            "execution": {
                "fee_rate": float(fee_rate),
                "slippage_bps": float(slippage_bps),
                "execution_model": execution_model,
                "stop_fill_model": stop_fill_model,
                "leverage": float(leverage),
                "margin_mode": margin_mode,
            },
        }

        # Backward compatibility with legacy strategies using top-level OHLCV.
        candle = context["candle"]
        for key in ("open", "high", "low", "close", "volume", "timestamp"):
            if key in candle:
                context[key] = candle[key]

        return context

    # First bar cannot generate signal
    if index == 0:
        return _base_context({}, tuple())

    # Use only completed candles (no lookahead)
    prev_index = index - 1

    start = max(0, prev_index - history_window + 1)
    history_slice = tuple(candles[start : prev_index + 1])

    indicators_at_index = {
        key: series[prev_index]
        for key, series in indicator_series.items()
    }

    return _base_context(indicators_at_index, history_slice)
