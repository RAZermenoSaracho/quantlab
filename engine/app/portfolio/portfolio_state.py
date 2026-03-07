from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class PortfolioState:
    cash_balance: float
    positions: Dict[str, Any] = field(default_factory=dict)
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    total_equity: float = 0.0
    last_price: Optional[float] = None

    def recalc(self) -> None:
        base_qty = float(self.positions.get("base_qty", 0.0))
        entry_price = float(self.positions.get("entry_price", 0.0))
        mark_price = float(self.last_price if self.last_price is not None else entry_price)

        self.unrealized_pnl = max(0.0, base_qty) * (mark_price - entry_price)
        self.total_equity = float(self.cash_balance) + (base_qty * mark_price)
