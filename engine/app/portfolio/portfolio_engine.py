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
        avg_entry = float(
            self.state.positions.get(
                "average_entry_price",
                self.state.positions.get("entry_price", 0.0),
            )
        )
        qty = float(self.state.positions.get("base_qty", 0.0))
        mark_price = float(self.state.last_price if self.state.last_price is not None else avg_entry)
        market_value = max(0.0, qty) * mark_price
        return {
            "side": "LONG",
            "entry_price": avg_entry,
            "average_entry_price": avg_entry,
            "quantity": qty,
            "opened_at": int(self.state.positions.get("opened_at", 0)),
            "entry_notional": float(self.state.positions.get("entry_notional", 0.0)),
            "entry_fee": float(
                self.state.positions.get(
                    "fees_paid_quote",
                    self.state.positions.get("entry_fee_quote", 0.0),
                )
            ),
            "fee_rate_used": float(self.state.positions.get("fee_rate_used", 0.0)),
            "fees_paid": float(
                self.state.positions.get(
                    "fees_paid_quote",
                    self.state.positions.get("entry_fee_quote", 0.0),
                )
            ),
            "entries_count": int(self.state.positions.get("entries_count", 1)),
            "market_value": market_value,
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

        effective_price = float(price) * (1 + float(slippage_bps) / 10_000.0)
        if effective_price <= 0:
            return None
        capital_to_use = min(float(capital_to_use), float(self.state.cash_balance))
        if capital_to_use <= 0:
            return None

        entry_notional = float(capital_to_use)
        entry_fee_quote = entry_notional * float(fee_rate)
        net_quote = entry_notional - entry_fee_quote
        if net_quote <= 0:
            return None
        net_qty = net_quote / effective_price
        if net_qty <= 0:
            return None

        fill_payload: Dict[str, Any] = {}
        if self.position is None:
            self.state.cash_balance -= entry_notional
            self.state.positions = {
                "base_qty": float(net_qty),
                "entry_price": float(effective_price),
                "average_entry_price": float(effective_price),
                "opened_at": int(timestamp),
                "entry_notional": float(entry_notional),
                "fees_paid_quote": float(entry_fee_quote),
                "entry_fee_quote": float(entry_fee_quote),
                "fee_rate_used": float(fee_rate),
                "entries_count": 1,
            }
            self.state.fees_paid += float(entry_fee_quote)
            fill_payload = {
                "side": "LONG",
                "entry_price": float(effective_price),
                "quantity": float(net_qty),
                "entry_notional": float(entry_notional),
                "entry_fee": float(entry_fee_quote),
                "fee_rate_used": float(fee_rate),
                "entries_count_after_fill": 1,
            }
        else:
            prev_qty = float(self.state.positions.get("base_qty", 0.0))
            prev_avg_entry = float(
                self.state.positions.get(
                    "average_entry_price",
                    self.state.positions.get("entry_price", 0.0),
                )
            )
            prev_entry_notional = float(self.state.positions.get("entry_notional", 0.0))
            prev_fees_paid = float(
                self.state.positions.get(
                    "fees_paid_quote",
                    self.state.positions.get("entry_fee_quote", 0.0),
                )
            )
            new_qty = prev_qty + float(net_qty)
            if new_qty <= 0:
                return None
            new_avg_entry = ((prev_avg_entry * prev_qty) + (effective_price * float(net_qty))) / new_qty
            self.state.cash_balance -= entry_notional
            self.state.positions.update({
                "base_qty": float(new_qty),
                "entry_price": float(new_avg_entry),
                "average_entry_price": float(new_avg_entry),
                "entry_notional": float(prev_entry_notional + entry_notional),
                "fees_paid_quote": float(prev_fees_paid + entry_fee_quote),
                "entry_fee_quote": float(prev_fees_paid + entry_fee_quote),
                "fee_rate_used": float(fee_rate),
                "entries_count": int(self.state.positions.get("entries_count", 1)) + 1,
            })
            self.state.fees_paid += float(entry_fee_quote)
            fill_payload = {
                "side": "LONG",
                "entry_price": float(effective_price),
                "quantity": float(net_qty),
                "entry_notional": float(entry_notional),
                "entry_fee": float(entry_fee_quote),
                "fee_rate_used": float(fee_rate),
                "entries_count_after_fill": int(self.state.positions.get("entries_count", 1)),
            }

        self.state.last_price = float(price)
        self.state.recalc()
        return {
            "position": self.position,
            "fill": fill_payload,
        }

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
        entry_price = float(position.get("average_entry_price", position["entry_price"]))
        effective_exit = float(price) * (1 - float(slippage_bps) / 10_000.0)
        entry_notional = float(position.get("entry_notional", entry_price * qty))
        entry_fee = float(position.get("fees_paid", position.get("entry_fee", 0.0)))
        fee_rate_used = float(position.get("fee_rate_used", fee_rate))
        exit_notional = qty * effective_exit
        exit_fee = exit_notional * fee_rate_used
        net_quote = exit_notional - exit_fee

        self.state.cash_balance += net_quote
        pnl = (
            (effective_exit - entry_price) * qty
            - entry_fee
            - exit_fee
        )
        self.state.realized_pnl += float(pnl)
        self.state.fees_paid += float(exit_fee)
        opened_at = int(position.get("opened_at", timestamp))
        self.state.positions = {}
        self.state.last_price = float(price)
        self.state.recalc()

        return {
            "side": "LONG",
            "entry_price": entry_price,
            "exit_price": float(effective_exit),
            "entry_notional": float(entry_notional),
            "exit_notional": float(exit_notional),
            "entry_fee": float(entry_fee),
            "exit_fee": float(exit_fee),
            "total_fee": float(entry_fee + exit_fee),
            "gross_pnl": float((effective_exit - entry_price) * qty),
            "net_pnl": float(pnl),
            "pnl": float(pnl),
            "fee_rate_used": float(fee_rate_used),
            "quantity": qty,
            "opened_at": opened_at,
            "closed_at": int(timestamp),
        }

    def snapshot(self, run_id: str) -> Dict[str, Any]:
        base_qty = float(self.state.positions.get("base_qty", 0.0))
        avg_entry = float(
            self.state.positions.get(
                "average_entry_price",
                self.state.positions.get("entry_price", 0.0),
            )
        )
        market_value = base_qty * float(self.state.last_price or avg_entry or 0.0)
        equity = float(self.state.total_equity)
        exposure_pct = float((market_value / equity) * 100.0) if equity > 0 else 0.0
        return {
            "run_id": run_id,
            "balance": float(self.state.cash_balance),
            "equity": float(self.state.total_equity),
            "pnl": float(self.state.realized_pnl + self.state.unrealized_pnl),
            "positions": {
                "base_qty": base_qty,
                "entry_price": avg_entry,
                "average_entry_price": avg_entry,
                "entries_count": int(self.state.positions.get("entries_count", 1)),
            }
            if self.state.positions
            else None,
            "unrealized_pnl": float(self.state.unrealized_pnl),
            "realized_pnl": float(self.state.realized_pnl),
            "cash_balance": float(self.state.cash_balance),
            "fees_paid": float(self.state.fees_paid),
            "open_positions": 1 if self.state.positions else 0,
            "exposure_pct": exposure_pct,
        }

    def position_metrics(self, mark_price: float) -> Optional[Dict[str, Any]]:
        position = self.position
        if position is None:
            return None

        qty = float(position["quantity"])
        entry_price = float(position.get("average_entry_price", position["entry_price"]))
        fee_rate_used = float(position.get("fee_rate_used", 0.0))
        entry_notional = float(position.get("entry_notional", entry_price * qty))
        entry_fee = float(position.get("fees_paid", position.get("entry_fee", 0.0)))
        exit_notional = float(mark_price) * qty
        estimated_exit_fee = exit_notional * fee_rate_used
        gross_pnl = (float(mark_price) - entry_price) * qty
        net_pnl = gross_pnl - entry_fee - estimated_exit_fee
        breakeven_price = (
            (entry_notional + entry_fee) / (max(qty, 1e-12) * max(1.0 - fee_rate_used, 1e-12))
        )

        return {
            **position,
            "average_entry_price": float(entry_price),
            "market_value": float(exit_notional),
            "realized_pnl": float(self.state.realized_pnl),
            "unrealized_pnl": float(self.state.unrealized_pnl),
            "fees_paid": float(entry_fee),
            "entries_count": int(position.get("entries_count", 1)),
            "gross_pnl": float(gross_pnl),
            "estimated_exit_fee": float(estimated_exit_fee),
            "total_fee_so_far": float(entry_fee + estimated_exit_fee),
            "net_pnl": float(net_pnl),
            "breakeven_price": float(breakeven_price),
        }
