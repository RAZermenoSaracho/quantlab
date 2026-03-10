from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Optional, Tuple


@dataclass
class PortfolioState:
    cash_balance: float
    positions: Dict[str, Any] = field(default_factory=dict)
    last_prices: Dict[str, float] = field(default_factory=dict)
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    fees_paid: float = 0.0
    total_equity: float = 0.0
    last_price: Optional[float] = None

    def _iter_positions(self) -> Iterable[Tuple[str, Dict[str, Any]]]:
        # Backward compatibility: old shape stored a single position dict directly in `positions`.
        if "base_qty" in self.positions:
            yield "__default__", self.positions
            return
        for symbol, position in self.positions.items():
            if isinstance(position, dict):
                yield str(symbol), position

    def recalc(self) -> None:
        total_market_value = 0.0
        total_unrealized = 0.0

        for symbol, position in self._iter_positions():
            base_qty = float(position.get("base_qty", 0.0))
            if base_qty <= 0:
                continue

            entry_price = float(
                position.get(
                    "average_entry_price",
                    position.get("entry_price", 0.0),
                )
            )
            fee_rate_used = float(position.get("fee_rate_used", 0.0))
            entry_fee = float(
                position.get(
                    "fees_paid_quote",
                    position.get("entry_fee_quote", 0.0),
                )
            )
            symbol_price = self.last_prices.get(symbol)
            mark_price = float(
                symbol_price
                if symbol_price is not None
                else (self.last_price if self.last_price is not None else entry_price)
            )

            gross_unrealized = base_qty * (mark_price - entry_price)
            estimated_exit_fee = base_qty * mark_price * fee_rate_used
            total_unrealized += gross_unrealized - entry_fee - estimated_exit_fee
            total_market_value += base_qty * mark_price

        self.unrealized_pnl = float(total_unrealized)
        self.total_equity = float(self.cash_balance) + float(total_market_value)
