from __future__ import annotations


class FixedBpsSlippage:
    def __init__(self, bps: float) -> None:
        self.rate = max(0.0, float(bps)) / 10_000.0

    def apply(self, price: float, side: str, is_entry: bool) -> float:
        px = float(price)
        if px <= 0 or self.rate <= 0:
            return px

        normalized_side = str(side).upper().strip()

        if normalized_side == "LONG":
            if is_entry:
                return px * (1.0 + self.rate)
            return px * (1.0 - self.rate)

        if normalized_side == "SHORT":
            if is_entry:
                return px * (1.0 - self.rate)
            return px * (1.0 + self.rate)

        return px
