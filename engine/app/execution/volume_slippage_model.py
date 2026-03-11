from __future__ import annotations


class VolumeImpactSlippage:
    def __init__(self, impact_factor: float = 0.1) -> None:
        self.impact_factor = max(0.0, float(impact_factor))

    def apply(
        self,
        price: float,
        side: str,
        is_entry: bool,
        order_quantity: float,
        candle_volume: float | None,
    ) -> float:
        px = float(price)
        qty = max(0.0, float(order_quantity))
        if px <= 0 or qty <= 0 or self.impact_factor <= 0:
            return px
        if candle_volume is None:
            return px
        vol = float(candle_volume)
        if vol <= 0:
            return px

        impact = (qty / vol) * self.impact_factor
        normalized_side = str(side).upper().strip()

        if normalized_side == "LONG":
            if is_entry:
                return px * (1.0 + impact)
            return px * (1.0 - impact)

        if normalized_side == "SHORT":
            if is_entry:
                return px * (1.0 - impact)
            return px * (1.0 + impact)

        return px
