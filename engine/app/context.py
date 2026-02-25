from typing import List, Dict, Optional


def build_context(
    index: int,
    candles: List[dict],
    indicator_series: Dict[str, List],
    position: Optional[dict],
    balance: float,
    initial_balance: float,
    timeframe: str,
    history_window: int,
) -> Dict:

    # First bar cannot generate signal
    if index == 0:
        return {
            "candle": candles[index],
            "history": tuple(),
            "position": position,
            "balance": balance,
            "initial_balance": initial_balance,
            "timeframe": timeframe,
            "indicators": {},
            "index": index,
        }

    # Use only completed candles (no lookahead)
    prev_index = index - 1

    start = max(0, prev_index - history_window + 1)
    history_slice = tuple(candles[start : prev_index + 1])

    indicators_at_index = {
        key: series[prev_index]
        for key, series in indicator_series.items()
    }

    return {
        "candle": candles[index],  # execution candle
        "history": history_slice,  # past only
        "position": position,
        "balance": balance,
        "initial_balance": initial_balance,
        "timeframe": timeframe,
        "indicators": indicators_at_index,
        "index": index,
    }