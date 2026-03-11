from __future__ import annotations
import math
from typing import Optional


def compute_notional(quantity: float, price: float) -> float:
    qty = float(quantity)
    px = float(price)
    if qty <= 0 or px <= 0:
        return 0.0
    return qty * px


def compute_fee(notional: float, fee_rate: float) -> float:
    val = float(notional)
    rate = float(fee_rate)
    if val <= 0 or rate < 0:
        return 0.0
    return val * rate


def compute_total_fee(entry_fee: float, exit_fee: float) -> float:
    return float(entry_fee) + float(exit_fee)


def compute_gross_pnl(side: str, entry_price: float, exit_price: float, quantity: float) -> float:
    entry = float(entry_price)
    exit_ = float(exit_price)
    qty = float(quantity)
    normalized_side = str(side).upper()
    if normalized_side == "SHORT":
        return (entry - exit_) * qty
    return (exit_ - entry) * qty


def compute_net_pnl(gross_pnl: float, total_fee: float) -> float:
    return float(gross_pnl) - float(total_fee)


def compute_pnl_percent(net_pnl: float, entry_notional: float) -> float:
    base = float(entry_notional)
    if base <= 0:
        return 0.0
    return (float(net_pnl) / base) * 100.0


def normalize_quantity(quantity: float, step: Optional[float] = None) -> float:
    qty = float(quantity)
    if qty <= 0:
        return 0.0
    if step is None:
        return qty
    step_size = float(step)
    if step_size <= 0:
        return qty
    units = math.floor((qty / step_size) + 1e-12)
    return max(0.0, units * step_size)
