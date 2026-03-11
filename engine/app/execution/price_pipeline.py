from __future__ import annotations

from .slippage_model import FixedBpsSlippage
from .spread_model import FixedBpsSpread
from .volume_slippage_model import VolumeImpactSlippage


def normalize_price_to_tick(price: float, tick_size: float | None) -> float:
    px = float(price)
    if px <= 0:
        return px
    if tick_size is None:
        return px
    tick = float(tick_size)
    if tick <= 0:
        return px
    return round(px / tick) * tick


def resolve_execution_price(
    *,
    mid_price: float,
    side: str,
    is_entry: bool,
    slippage_bps: float = 0.0,
    spread_bps: float = 0.0,
    impact_factor: float = 0.1,
    order_quantity: float = 0.0,
    candle_volume: float | None = None,
    tick_size: float | None = None,
) -> float:
    spread_model = FixedBpsSpread(spread_bps)
    slippage_model = FixedBpsSlippage(slippage_bps)
    impact_model = VolumeImpactSlippage(impact_factor=impact_factor)

    spread_price = spread_model.execution_price(mid_price=mid_price, side=side, is_entry=is_entry)
    slippage_price = slippage_model.apply(spread_price, side=side, is_entry=is_entry)
    impact_price = impact_model.apply(
        slippage_price,
        side=side,
        is_entry=is_entry,
        order_quantity=order_quantity,
        candle_volume=candle_volume,
    )
    return normalize_price_to_tick(impact_price, tick_size=tick_size)
