from __future__ import annotations


class FixedBpsSpread:
    def __init__(self, bps: float) -> None:
        self.rate = max(0.0, float(bps)) / 10_000.0

    def get_bid_ask(self, mid_price: float) -> tuple[float, float]:
        mid = float(mid_price)
        if mid <= 0 or self.rate <= 0:
            return mid, mid
        spread = mid * self.rate
        bid = mid - (spread / 2.0)
        ask = mid + (spread / 2.0)
        return bid, ask

    def execution_price(self, mid_price: float, side: str, is_entry: bool) -> float:
        bid, ask = self.get_bid_ask(mid_price)
        normalized_side = str(side).upper().strip()

        if normalized_side == "LONG":
            return ask if is_entry else bid
        if normalized_side == "SHORT":
            return bid if is_entry else ask
        return float(mid_price)
