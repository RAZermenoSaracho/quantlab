from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from .fee_model import (
    compute_fee,
    compute_gross_pnl,
    compute_net_pnl,
    compute_notional,
    normalize_quantity,
    compute_total_fee,
)
from .portfolio_state import PortfolioState


_DEFAULT_SYMBOL = "__default__"


@dataclass
class PortfolioEngine:
    initial_cash: float

    def __post_init__(self) -> None:
        self.state = PortfolioState(
            cash_balance=float(self.initial_cash),
            total_equity=float(self.initial_cash),
        )
        self.primary_symbol = _DEFAULT_SYMBOL

    def _symbol_key(self, symbol: Optional[str]) -> str:
        if symbol is None or not str(symbol).strip():
            return _DEFAULT_SYMBOL
        return str(symbol).upper()

    def _position_row(self, symbol: Optional[str] = None) -> Optional[Dict[str, Any]]:
        key = self._symbol_key(symbol)
        row = self.state.positions.get(key)
        if isinstance(row, dict):
            return row
        return None

    def position_for_symbol(self, symbol: str) -> Optional[Dict[str, Any]]:
        row = self._position_row(symbol)
        if row is None:
            return None

        avg_entry = float(
            row.get("average_entry_price", row.get("entry_price", 0.0))
        )
        qty = float(row.get("base_qty", 0.0))
        if qty <= 0:
            return None

        key = self._symbol_key(symbol)
        mark_price = float(
            self.state.last_prices.get(
                key,
                self.state.last_price if self.state.last_price is not None else avg_entry,
            )
        )
        market_value = max(0.0, qty) * mark_price

        return {
            "symbol": key,
            "side": "LONG",
            "entry_price": avg_entry,
            "average_entry_price": avg_entry,
            "quantity": qty,
            "opened_at": int(row.get("opened_at", 0)),
            "entry_notional": float(row.get("entry_notional", 0.0)),
            "entry_fee": float(
                row.get("fees_paid_quote", row.get("entry_fee_quote", 0.0))
            ),
            "fee_rate_used": float(row.get("fee_rate_used", 0.0)),
            "fees_paid": float(
                row.get("fees_paid_quote", row.get("entry_fee_quote", 0.0))
            ),
            "entries_count": int(row.get("entries_count", 1)),
            "market_value": market_value,
        }

    @property
    def position(self) -> Optional[Dict[str, Any]]:
        if self.primary_symbol in self.state.positions:
            pos = self.position_for_symbol(self.primary_symbol)
            if pos is not None:
                return pos
        for symbol in self.state.positions.keys():
            pos = self.position_for_symbol(symbol)
            if pos is not None:
                return pos
        return None

    def positions_by_symbol(self) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for symbol in self.state.positions.keys():
            pos = self.position_for_symbol(symbol)
            if pos is not None:
                out[symbol] = pos
        return out

    def open_positions_count(self) -> int:
        return len(self.positions_by_symbol())

    def apply_price_update_for_symbol(self, symbol: str, price: float) -> None:
        key = self._symbol_key(symbol)
        self.state.last_prices[key] = float(price)
        self.state.last_price = float(price)
        self.state.recalc()

    def apply_price_update(self, price: float, symbol: Optional[str] = None) -> None:
        key = self._symbol_key(symbol if symbol is not None else self.primary_symbol)
        self.state.last_prices[key] = float(price)
        self.state.last_price = float(price)
        self.state.recalc()

    def apply_price_update_bulk(self, prices: Dict[str, float]) -> None:
        for symbol, price in prices.items():
            key = self._symbol_key(symbol)
            self.state.last_prices[key] = float(price)
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
        symbol: Optional[str] = None,
        quantity_step: Optional[float] = None,
    ) -> Optional[Dict[str, Any]]:
        if side != "LONG":
            return None
        if capital_to_use <= 0:
            return None

        key = self._symbol_key(symbol)
        self.primary_symbol = key

        effective_price = float(price) * (1 + float(slippage_bps) / 10_000.0)
        if effective_price <= 0:
            return None

        capital_to_use = min(float(capital_to_use), float(self.state.cash_balance))
        if capital_to_use <= 0:
            return None

        fee_rate_used = float(fee_rate)
        if fee_rate_used < 0:
            return None

        # Keep notional strictly tied to quantity*price.
        gross_qty = normalize_quantity((capital_to_use / effective_price), quantity_step)
        if gross_qty <= 0:
            return None
        entry_notional = compute_notional(gross_qty, effective_price)
        entry_fee_quote = compute_fee(entry_notional, fee_rate_used)
        total_cash_out = entry_notional + entry_fee_quote
        if total_cash_out > float(self.state.cash_balance):
            max_notional = float(self.state.cash_balance) / (1.0 + fee_rate_used)
            if max_notional <= 0:
                return None
            gross_qty = normalize_quantity((max_notional / effective_price), quantity_step)
            if gross_qty <= 0:
                return None
            entry_notional = compute_notional(gross_qty, effective_price)
            entry_fee_quote = compute_fee(entry_notional, fee_rate_used)
            total_cash_out = entry_notional + entry_fee_quote
        net_qty = gross_qty
        if net_qty <= 0:
            return None

        row = self._position_row(key)
        fill_payload: Dict[str, Any]

        if row is None:
            self.state.cash_balance -= total_cash_out
            self.state.positions[key] = {
                "base_qty": float(net_qty),
                "entry_price": float(effective_price),
                "average_entry_price": float(effective_price),
                "opened_at": int(timestamp),
                "entry_notional": float(entry_notional),
                "fees_paid_quote": float(entry_fee_quote),
                "entry_fee_quote": float(entry_fee_quote),
                "fee_rate_used": float(fee_rate_used),
                "entries_count": 1,
            }
            self.state.fees_paid += float(entry_fee_quote)
            fill_payload = {
                "symbol": key,
                "side": "LONG",
                "entry_price": float(effective_price),
                "quantity": float(net_qty),
                "entry_notional": float(entry_notional),
                "entry_fee": float(entry_fee_quote),
                "fee_rate_used": float(fee_rate_used),
                "entries_count_after_fill": 1,
            }
        else:
            prev_qty = float(row.get("base_qty", 0.0))
            prev_avg_entry = float(row.get("average_entry_price", row.get("entry_price", 0.0)))
            prev_entry_notional = float(row.get("entry_notional", 0.0))
            prev_fees_paid = float(row.get("fees_paid_quote", row.get("entry_fee_quote", 0.0)))
            new_qty = prev_qty + float(net_qty)
            if new_qty <= 0:
                return None
            new_avg_entry = ((prev_avg_entry * prev_qty) + (effective_price * float(net_qty))) / new_qty
            self.state.cash_balance -= total_cash_out
            row.update({
                "base_qty": float(new_qty),
                "entry_price": float(new_avg_entry),
                "average_entry_price": float(new_avg_entry),
                "entry_notional": float(prev_entry_notional + entry_notional),
                "fees_paid_quote": float(prev_fees_paid + entry_fee_quote),
                "entry_fee_quote": float(prev_fees_paid + entry_fee_quote),
                "fee_rate_used": float(fee_rate_used),
                "entries_count": int(row.get("entries_count", 1)) + 1,
            })
            self.state.fees_paid += float(entry_fee_quote)
            fill_payload = {
                "symbol": key,
                "side": "LONG",
                "entry_price": float(effective_price),
                "quantity": float(net_qty),
                "entry_notional": float(entry_notional),
                "entry_fee": float(entry_fee_quote),
                "fee_rate_used": float(fee_rate_used),
                "entries_count_after_fill": int(row.get("entries_count", 1)),
            }

        self.state.last_prices[key] = float(price)
        self.state.last_price = float(price)
        self.state.recalc()
        return {
            "position": self.position_for_symbol(key),
            "fill": fill_payload,
        }

    def apply_trade_close(
        self,
        price: float,
        fee_rate: float,
        timestamp: int,
        slippage_bps: float = 0.0,
        symbol: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        key = self._symbol_key(symbol if symbol is not None else self.primary_symbol)
        position = self.position_for_symbol(key)
        if position is None:
            return None

        qty = float(position["quantity"])
        entry_price = float(position.get("average_entry_price", position["entry_price"]))
        effective_exit = float(price) * (1 - float(slippage_bps) / 10_000.0)
        entry_notional = float(position.get("entry_notional", entry_price * qty))
        entry_fee = float(position.get("fees_paid", position.get("entry_fee", 0.0)))
        fee_rate_used = float(position.get("fee_rate_used", fee_rate))
        exit_notional = compute_notional(qty, effective_exit)
        exit_fee = compute_fee(exit_notional, fee_rate_used)
        net_quote = exit_notional - exit_fee

        self.state.cash_balance += net_quote
        gross_pnl = compute_gross_pnl("LONG", entry_price, effective_exit, qty)
        total_fee = compute_total_fee(entry_fee, exit_fee)
        pnl = compute_net_pnl(gross_pnl, total_fee)
        self.state.realized_pnl += float(pnl)
        self.state.fees_paid += float(exit_fee)
        opened_at = int(position.get("opened_at", timestamp))
        self.state.positions.pop(key, None)
        self.state.last_prices[key] = float(price)
        self.state.last_price = float(price)
        self.state.recalc()

        return {
            "symbol": key,
            "side": "LONG",
            "entry_price": entry_price,
            "exit_price": float(effective_exit),
            "entry_notional": float(entry_notional),
            "exit_notional": float(exit_notional),
            "entry_fee": float(entry_fee),
            "exit_fee": float(exit_fee),
            "total_fee": float(total_fee),
            "gross_pnl": float(gross_pnl),
            "net_pnl": float(pnl),
            "pnl": float(pnl),
            "fee_rate_used": float(fee_rate_used),
            "quantity": qty,
            "opened_at": opened_at,
            "closed_at": int(timestamp),
        }

    def snapshot(self, run_id: str) -> Dict[str, Any]:
        positions = self.positions_by_symbol()
        total_market_value = sum(float(p.get("market_value", 0.0)) for p in positions.values())
        equity = float(self.state.total_equity)
        exposure_pct = float((total_market_value / equity) * 100.0) if equity > 0 else 0.0
        primary = positions.get(self.primary_symbol) or next(iter(positions.values()), None)

        return {
            "run_id": run_id,
            "balance": float(self.state.cash_balance),
            "equity": float(self.state.total_equity),
            "pnl": float(self.state.realized_pnl + self.state.unrealized_pnl),
            "positions": positions,
            "position": primary,
            "unrealized_pnl": float(self.state.unrealized_pnl),
            "realized_pnl": float(self.state.realized_pnl),
            "cash_balance": float(self.state.cash_balance),
            "fees_paid": float(self.state.fees_paid),
            "open_positions": len(positions),
            "exposure_pct": exposure_pct,
        }

    def position_metrics(self, mark_price: float, symbol: Optional[str] = None) -> Optional[Dict[str, Any]]:
        key = self._symbol_key(symbol if symbol is not None else self.primary_symbol)
        position = self.position_for_symbol(key)
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
            "symbol": key,
            "average_entry_price": float(entry_price),
            "market_value": float(exit_notional),
            "realized_pnl": float(self.state.realized_pnl),
            "unrealized_pnl": float(net_pnl),
            "fees_paid": float(entry_fee),
            "entries_count": int(position.get("entries_count", 1)),
            "gross_pnl": float(gross_pnl),
            "estimated_exit_fee": float(estimated_exit_fee),
            "total_fee_so_far": float(entry_fee + estimated_exit_fee),
            "net_pnl": float(net_pnl),
            "breakeven_price": float(breakeven_price),
        }
