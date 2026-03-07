from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from .portfolio_state import PortfolioState


@dataclass
class PortfolioEngine:
    initial_cash: float

    def __post_init__(self) -> None:
        self.state = PortfolioState(
            cash_balance=float(self.initial_cash),
            total_equity=float(self.initial_cash),
        )

    @property
    def position(self) -> Optional[Dict[str, Any]]:
        if not self.state.positions:
            return None
        return {
            "side": "LONG",
            "entry_price": float(self.state.positions.get("entry_price", 0.0)),
            "quantity": float(self.state.positions.get("base_qty", 0.0)),
            "opened_at": int(self.state.positions.get("opened_at", 0)),
            "entry_fee_quote": float(self.state.positions.get("entry_fee_quote", 0.0)),
        }

    def apply_price_update(self, price: float) -> None:
        self.state.last_price = float(price)
        self.state.recalc()

    def apply_trade_open(
        self,
        side: str,
        price: float,
        capital_to_use: float,
        fee_rate: float,
        timestamp: int,
        slippage_bps: float = 0.0,
    ) -> Optional[Dict[str, Any]]:
        if side != "LONG":
            return None
        if capital_to_use <= 0:
            return None
        if self.position is not None:
            return None

        effective_price = float(price) * (1 + float(slippage_bps) / 10_000.0)
        gross_qty = float(capital_to_use) / effective_price
        fee_qty = gross_qty * float(fee_rate)
        net_qty = gross_qty - fee_qty
        if net_qty <= 0:
            return None

        usdt_spent = gross_qty * effective_price
        self.state.cash_balance -= usdt_spent
        self.state.positions = {
            "base_qty": float(net_qty),
            "entry_price": float(effective_price),
            "opened_at": int(timestamp),
            "entry_fee_quote": float(fee_qty * effective_price),
        }
        self.state.last_price = float(price)
        self.state.recalc()
        return self.position

    def apply_trade_close(
        self,
        price: float,
        fee_rate: float,
        timestamp: int,
        slippage_bps: float = 0.0,
    ) -> Optional[Dict[str, Any]]:
        position = self.position
        if position is None:
            return None

        qty = float(position["quantity"])
        entry_price = float(position["entry_price"])
        effective_exit = float(price) * (1 - float(slippage_bps) / 10_000.0)
        gross_quote = qty * effective_exit
        fee_quote = gross_quote * float(fee_rate)
        net_quote = gross_quote - fee_quote

        self.state.cash_balance += net_quote
        pnl = (
            (effective_exit - entry_price) * qty
            - float(position.get("entry_fee_quote", 0.0))
            - fee_quote
        )
        self.state.realized_pnl += float(pnl)
        opened_at = int(position.get("opened_at", timestamp))
        self.state.positions = {}
        self.state.last_price = float(price)
        self.state.recalc()

        return {
            "side": "LONG",
            "entry_price": entry_price,
            "exit_price": float(effective_exit),
            "quantity": qty,
            "pnl": float(pnl),
            "opened_at": opened_at,
            "closed_at": int(timestamp),
        }

    def snapshot(self, run_id: str) -> Dict[str, Any]:
        base_qty = float(self.state.positions.get("base_qty", 0.0))
        return {
            "run_id": run_id,
            "balance": float(self.state.cash_balance),
            "equity": float(self.state.total_equity),
            "pnl": float(self.state.realized_pnl + self.state.unrealized_pnl),
            "positions": {
                "base_qty": base_qty,
                "entry_price": float(self.state.positions.get("entry_price", 0.0)),
            }
            if self.state.positions
            else None,
            "unrealized_pnl": float(self.state.unrealized_pnl),
            "realized_pnl": float(self.state.realized_pnl),
            "cash_balance": float(self.state.cash_balance),
        }
