from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


def timeframe_to_ms(timeframe: str) -> int:
    tf = str(timeframe).strip().lower()
    if len(tf) < 2:
        raise ValueError(f"Invalid timeframe: {timeframe}")

    unit = tf[-1]
    value = int(tf[:-1])
    if value <= 0:
        raise ValueError(f"Invalid timeframe: {timeframe}")

    if unit == "s":
        return value * 1_000
    if unit == "m":
        return value * 60_000
    if unit == "h":
        return value * 3_600_000
    if unit == "d":
        return value * 86_400_000

    raise ValueError(f"Unsupported timeframe unit: {timeframe}")


def _bucket_start_ms(timestamp_ms: int, timeframe_ms: int) -> int:
    return int(timestamp_ms // timeframe_ms) * timeframe_ms


@dataclass
class CandleAggregator:
    timeframe: str

    def __post_init__(self) -> None:
        self.timeframe_ms = timeframe_to_ms(self.timeframe)
        self._current: Optional[Dict[str, float]] = None

    def add_trade(self, price: float, qty: float, timestamp_ms: int) -> List[Dict[str, float]]:
        px = float(price)
        vol = float(qty)
        ts = int(timestamp_ms)
        bucket_start = _bucket_start_ms(ts, self.timeframe_ms)

        if self._current is None:
            self._current = {
                "timestamp": bucket_start,
                "open": px,
                "high": px,
                "low": px,
                "close": px,
                "volume": max(0.0, vol),
            }
            return []

        current_ts = int(self._current["timestamp"])

        if bucket_start == current_ts:
            self._current["high"] = max(float(self._current["high"]), px)
            self._current["low"] = min(float(self._current["low"]), px)
            self._current["close"] = px
            self._current["volume"] = float(self._current["volume"]) + max(0.0, vol)
            return []

        closed: List[Dict[str, float]] = [dict(self._current)]
        last_close = float(self._current["close"])
        gap_ts = current_ts + self.timeframe_ms
        while gap_ts < bucket_start:
            closed.append(
                {
                    "timestamp": gap_ts,
                    "open": last_close,
                    "high": last_close,
                    "low": last_close,
                    "close": last_close,
                    "volume": 0.0,
                }
            )
            gap_ts += self.timeframe_ms

        self._current = {
            "timestamp": bucket_start,
            "open": px,
            "high": px,
            "low": px,
            "close": px,
            "volume": max(0.0, vol),
        }
        return closed


@dataclass
class CandleResampler:
    timeframe: str

    def __post_init__(self) -> None:
        self.timeframe_ms = timeframe_to_ms(self.timeframe)
        self._current: Optional[Dict[str, float]] = None

    def add_candle(self, candle: Dict[str, float]) -> List[Dict[str, float]]:
        ts = int(candle["timestamp"])
        bucket_start = _bucket_start_ms(ts, self.timeframe_ms)

        if self._current is None:
            self._current = {
                "timestamp": bucket_start,
                "open": float(candle["open"]),
                "high": float(candle["high"]),
                "low": float(candle["low"]),
                "close": float(candle["close"]),
                "volume": float(candle.get("volume", 0.0)),
            }
            return []

        current_ts = int(self._current["timestamp"])
        if bucket_start == current_ts:
            self._current["high"] = max(float(self._current["high"]), float(candle["high"]))
            self._current["low"] = min(float(self._current["low"]), float(candle["low"]))
            self._current["close"] = float(candle["close"])
            self._current["volume"] = float(self._current["volume"]) + float(candle.get("volume", 0.0))
            return []

        closed: List[Dict[str, float]] = [dict(self._current)]
        last_close = float(self._current["close"])
        gap_ts = current_ts + self.timeframe_ms
        while gap_ts < bucket_start:
            closed.append(
                {
                    "timestamp": gap_ts,
                    "open": last_close,
                    "high": last_close,
                    "low": last_close,
                    "close": last_close,
                    "volume": 0.0,
                }
            )
            gap_ts += self.timeframe_ms

        self._current = {
            "timestamp": bucket_start,
            "open": float(candle["open"]),
            "high": float(candle["high"]),
            "low": float(candle["low"]),
            "close": float(candle["close"]),
            "volume": float(candle.get("volume", 0.0)),
        }
        return closed
