import unittest
from pathlib import Path
import sys

ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from app.portfolio.fee_model import (
    compute_fee,
    compute_gross_pnl,
    compute_net_pnl,
    compute_notional,
    compute_pnl_percent,
    compute_total_fee,
    normalize_quantity,
)
from app.portfolio.portfolio_engine import PortfolioEngine


class TradeAccountingTest(unittest.TestCase):
    def test_notional_and_pnl_formula_case(self) -> None:
        qty = 0.218
        entry_price = 2073.58
        exit_price = 2080.04
        fee_rate = 0.001

        entry_notional = compute_notional(qty, entry_price)
        exit_notional = compute_notional(qty, exit_price)
        gross_pnl = compute_gross_pnl("LONG", entry_price, exit_price, qty)
        entry_fee = compute_fee(entry_notional, fee_rate)
        exit_fee = compute_fee(exit_notional, fee_rate)
        total_fee = compute_total_fee(entry_fee, exit_fee)
        net_pnl = compute_net_pnl(gross_pnl, total_fee)
        pnl_pct = compute_pnl_percent(net_pnl, entry_notional)

        self.assertAlmostEqual(entry_notional, qty * entry_price, places=12)
        self.assertAlmostEqual(exit_notional, qty * exit_price, places=12)
        self.assertAlmostEqual(gross_pnl, (exit_price - entry_price) * qty, places=12)
        self.assertAlmostEqual(total_fee, entry_fee + exit_fee, places=12)
        self.assertAlmostEqual(net_pnl, gross_pnl - total_fee, places=12)
        self.assertAlmostEqual(pnl_pct, (net_pnl / entry_notional) * 100.0, places=12)

    def test_portfolio_engine_open_close_keeps_notional_from_qty_price(self) -> None:
        engine = PortfolioEngine(initial_cash=1_000.0)

        opened = engine.apply_trade_open(
            side="LONG",
            price=2073.58,
            capital_to_use=500.0,
            fee_rate=0.001,
            timestamp=1_700_000_000_000,
            symbol="ETHUSDT",
        )
        self.assertIsNotNone(opened)

        fill = opened["fill"]
        qty = float(fill["quantity"])
        entry_price = float(fill["entry_price"])
        entry_notional = float(fill["entry_notional"])
        self.assertAlmostEqual(entry_notional, qty * entry_price, places=12)

        closed = engine.apply_trade_close(
            price=2080.04,
            fee_rate=0.001,
            timestamp=1_700_000_060_000,
            symbol="ETHUSDT",
        )
        self.assertIsNotNone(closed)

        qty_close = float(closed["quantity"])
        exit_price = float(closed["exit_price"])
        exit_notional = float(closed["exit_notional"])
        self.assertAlmostEqual(exit_notional, qty_close * exit_price, places=12)
        self.assertAlmostEqual(
            float(closed["net_pnl"]),
            float(closed["gross_pnl"]) - float(closed["total_fee"]),
            places=12,
        )

    def test_entry_notional_recomputed_after_qty_rounding(self) -> None:
        balance = 10_000.0
        position_pct = 0.095
        entry_price = 70_093.02
        fee_rate = 0.001
        quantity_step = 0.0001

        capital_to_use = balance * position_pct
        raw_qty = capital_to_use / entry_price
        rounded_qty = normalize_quantity(raw_qty, quantity_step)
        expected_entry_notional = rounded_qty * entry_price
        expected_entry_fee = expected_entry_notional * fee_rate

        engine = PortfolioEngine(initial_cash=balance)
        opened = engine.apply_trade_open(
            side="LONG",
            price=entry_price,
            capital_to_use=capital_to_use,
            fee_rate=fee_rate,
            timestamp=1_700_000_000_000,
            symbol="BTCUSDT",
            quantity_step=quantity_step,
        )
        self.assertIsNotNone(opened)

        fill = opened["fill"]
        qty = float(fill["quantity"])
        entry_notional = float(fill["entry_notional"])
        entry_fee = float(fill["entry_fee"])

        self.assertAlmostEqual(qty, rounded_qty, places=12)
        self.assertAlmostEqual(entry_notional, expected_entry_notional, places=12)
        self.assertAlmostEqual(entry_fee, expected_entry_fee, places=12)
        self.assertLess(abs(entry_notional - (qty * entry_price)), 1e-9)


if __name__ == "__main__":
    unittest.main()
