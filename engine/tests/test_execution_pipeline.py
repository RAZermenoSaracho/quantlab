import unittest
from pathlib import Path
import sys

ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from app.execution import FixedBpsSpread, VolumeImpactSlippage, normalize_price_to_tick
from app.portfolio.portfolio_engine import PortfolioEngine


class ExecutionPipelineTest(unittest.TestCase):
    def test_spread_bid_ask_from_mid(self) -> None:
        model = FixedBpsSpread(10.0)  # 0.10%
        bid, ask = model.get_bid_ask(100.0)
        self.assertAlmostEqual(bid, 99.95, places=12)
        self.assertAlmostEqual(ask, 100.05, places=12)

    def test_volume_impact_grows_with_order_size(self) -> None:
        model = VolumeImpactSlippage(impact_factor=0.1)
        base = 100.0
        low_qty_price = model.apply(base, side="LONG", is_entry=True, order_quantity=1.0, candle_volume=1000.0)
        high_qty_price = model.apply(base, side="LONG", is_entry=True, order_quantity=50.0, candle_volume=1000.0)
        self.assertGreater(high_qty_price, low_qty_price)

    def test_tick_size_normalization(self) -> None:
        self.assertAlmostEqual(normalize_price_to_tick(100.023, 0.01), 100.02, places=12)
        self.assertAlmostEqual(normalize_price_to_tick(100.027, 0.01), 100.03, places=12)

    def test_liquidity_cap_limits_entry_qty(self) -> None:
        engine = PortfolioEngine(initial_cash=10_000.0)
        opened = engine.apply_trade_open(
            side="LONG",
            price=100.0,
            capital_to_use=5_000.0,
            fee_rate=0.001,
            timestamp=1_700_000_000_000,
            slippage_bps=0.0,
            spread_bps=0.0,
            impact_factor=0.1,
            candle_volume=10.0,
            liquidity_fraction=0.05,  # max fill qty = 0.5
            tick_size=0.01,
            symbol="BTCUSDT",
            quantity_step=0.0001,
        )
        self.assertIsNotNone(opened)
        fill = opened["fill"]
        qty = float(fill["quantity"])
        self.assertLessEqual(qty, 0.5 + 1e-12)

    def test_entry_notional_matches_qty_times_execution_price(self) -> None:
        engine = PortfolioEngine(initial_cash=10_000.0)
        opened = engine.apply_trade_open(
            side="LONG",
            price=2_000.0,
            capital_to_use=1_000.0,
            fee_rate=0.001,
            timestamp=1_700_000_000_000,
            slippage_bps=4.0,
            spread_bps=6.0,
            impact_factor=0.1,
            candle_volume=500.0,
            liquidity_fraction=0.05,
            tick_size=0.01,
            symbol="ETHUSDT",
            quantity_step=0.0001,
        )
        self.assertIsNotNone(opened)
        fill = opened["fill"]
        qty = float(fill["quantity"])
        execution_price = float(fill["entry_price"])
        entry_notional = float(fill["entry_notional"])
        self.assertAlmostEqual(entry_notional, qty * execution_price, places=9)


if __name__ == "__main__":
    unittest.main()
