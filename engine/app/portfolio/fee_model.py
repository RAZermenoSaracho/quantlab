from __future__ import annotations


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
