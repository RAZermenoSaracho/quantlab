from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class PortfolioState:
    cash_balance: float
    positions: Dict[str, Any] = field(default_factory=dict)
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    fees_paid: float = 0.0
    total_equity: float = 0.0
    last_price: Optional[float] = None

    def recalc(self) -> None:
        base_qty = float(self.positions.get("base_qty", 0.0))
        entry_price = float(
            self.positions.get(
                "average_entry_price",
                self.positions.get("entry_price", 0.0),
            )
        )
        fee_rate_used = float(self.positions.get("fee_rate_used", 0.0))
        entry_fee = float(
            self.positions.get(
                "fees_paid_quote",
                self.positions.get("entry_fee_quote", 0.0),
            )
        )
        mark_price = float(self.last_price if self.last_price is not None else entry_price)

        gross_unrealized = max(0.0, base_qty) * (mark_price - entry_price)
        estimated_exit_fee = max(0.0, base_qty) * mark_price * fee_rate_used
        self.unrealized_pnl = gross_unrealized - entry_fee - estimated_exit_fee
        self.total_equity = float(self.cash_balance) + (base_qty * mark_price)
