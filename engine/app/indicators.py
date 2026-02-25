from typing import List, Dict
from math import sqrt


# =========================================================
# BASIC HELPERS
# =========================================================

def sma_series(values: List[float], window: int) -> List[float]:
    result = []
    for i in range(len(values)):
        if i + 1 < window:
            result.append(None)
        else:
            window_vals = values[i + 1 - window : i + 1]
            result.append(sum(window_vals) / window)
    return result


def ema_series(values: List[float], window: int) -> List[float]:
    result = []
    alpha = 2 / (window + 1)
    ema_prev = None

    for i, v in enumerate(values):
        if i + 1 < window:
            result.append(None)
            continue

        if ema_prev is None:
            initial = sum(values[i + 1 - window : i + 1]) / window
            ema_prev = initial
        else:
            ema_prev = alpha * v + (1 - alpha) * ema_prev

        result.append(ema_prev)

    return result


def rsi_series(values: List[float], window: int) -> List[float]:
    result = [None] * len(values)

    gains = []
    losses = []

    for i in range(1, len(values)):
        change = values[i] - values[i - 1]
        gains.append(max(change, 0))
        losses.append(abs(min(change, 0)))

        if i == window:
            avg_gain = sum(gains[:window]) / window
            avg_loss = sum(losses[:window]) / window

        elif i > window:
            avg_gain = (avg_gain * (window - 1) + gains[i - 1]) / window
            avg_loss = (avg_loss * (window - 1) + losses[i - 1]) / window
        else:
            continue

        if avg_loss == 0:
            result[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i] = 100 - (100 / (1 + rs))

    return result


def volatility_series(values: List[float], window: int) -> List[float]:
    result = []

    for i in range(len(values)):
        if i + 1 < window:
            result.append(None)
        else:
            window_vals = values[i + 1 - window : i + 1]
            mean = sum(window_vals) / window
            var = sum((x - mean) ** 2 for x in window_vals) / window
            result.append(sqrt(var))

    return result


def zscore_series(values: List[float], window: int) -> List[float]:
    result = []

    for i in range(len(values)):
        if i + 1 < window:
            result.append(None)
        else:
            window_vals = values[i + 1 - window : i + 1]
            mean = sum(window_vals) / window
            var = sum((x - mean) ** 2 for x in window_vals) / window
            std = sqrt(var)
            if std == 0:
                result.append(0.0)
            else:
                result.append((values[i] - mean) / std)

    return result


def atr_series(candles: List[dict], window: int) -> List[float]:
    result = []
    trs = []

    for i in range(len(candles)):
        if i == 0:
            trs.append(0)
            result.append(None)
            continue

        high = candles[i]["high"]
        low = candles[i]["low"]
        prev_close = candles[i - 1]["close"]

        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close),
        )
        trs.append(tr)

        if i < window:
            result.append(None)
        else:
            atr = sum(trs[i - window + 1 : i + 1]) / window
            result.append(atr)

    return result


# =========================================================
# MAIN ENGINE FUNCTION
# =========================================================

def compute_indicator_series(candles: List[dict], config) -> Dict[str, List]:

    closes = [c["close"] for c in candles]

    indicators = {}

    # Moving Averages
    indicators["sma_fast"] = sma_series(closes, config.fast_ma_window)
    indicators["sma_slow"] = sma_series(closes, config.slow_ma_window)

    indicators["ema_fast"] = ema_series(closes, config.fast_ma_window)
    indicators["ema_slow"] = ema_series(closes, config.slow_ma_window)

    # RSI
    indicators["rsi"] = rsi_series(closes, config.rsi_window)

    # Volatility
    indicators["volatility"] = volatility_series(closes, config.volatility_window)

    # ZScore
    indicators["zscore"] = zscore_series(closes, config.lookback_window)

    # ATR
    indicators["atr"] = atr_series(candles, config.volatility_window)

    return indicators