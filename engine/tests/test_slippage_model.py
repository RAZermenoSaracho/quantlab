import unittest
from pathlib import Path
import sys

ENGINE_ROOT = Path(__file__).resolve().parents[1]
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from app.execution import FixedBpsSlippage


class FixedBpsSlippageTest(unittest.TestCase):
    def test_long_entry_increases_price(self) -> None:
        model = FixedBpsSlippage(4.0)
        price = 2000.0
        self.assertAlmostEqual(model.apply(price, side="LONG", is_entry=True), 2000.0 * 1.0004, places=12)

    def test_long_exit_decreases_price(self) -> None:
        model = FixedBpsSlippage(4.0)
        price = 2000.0
        self.assertAlmostEqual(model.apply(price, side="LONG", is_entry=False), 2000.0 * 0.9996, places=12)

    def test_short_entry_decreases_price(self) -> None:
        model = FixedBpsSlippage(4.0)
        price = 2000.0
        self.assertAlmostEqual(model.apply(price, side="SHORT", is_entry=True), 2000.0 * 0.9996, places=12)

    def test_short_exit_increases_price(self) -> None:
        model = FixedBpsSlippage(4.0)
        price = 2000.0
        self.assertAlmostEqual(model.apply(price, side="SHORT", is_entry=False), 2000.0 * 1.0004, places=12)


if __name__ == "__main__":
    unittest.main()
