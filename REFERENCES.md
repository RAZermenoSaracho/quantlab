# References

## Trading Concepts

### Core PnL
- Long PnL = (exit_price - entry_price) * quantity
- Short PnL = (entry_price - exit_price) * quantity
- Gross PnL = raw profit before fees
- Net PnL = Gross PnL - fees
- PnL % = (net_pnl / initial_capital) * 100

### Fees
- Fees apply on both entry and exit
- entry_fee = entry_price * quantity * fee_rate
- exit_fee = exit_price * quantity * fee_rate
- total_fee = entry_fee + exit_fee
- Always subtract fees after computing gross PnL

### Slippage & Execution
- Real execution price != market price
- slippage = expected_price vs actual_fill_price
- Slippage increases with low liquidity, high volatility, large orders
- Always simulate slippage in backtests

### Spread
- spread = ask_price - bid_price
- Buying uses ask price, selling uses bid price
- Ignoring spread leads to unrealistic profits

### Position Management
- Position = { side, size, entry_price }
- Closing a position realizes PnL and resets state
- Partial closes must update position size and entry

### Average Entry Price
- avg_entry = (sum(price_i * qty_i)) / total_qty
- Required for DCA strategies
- Must update after each fill

### Equity & Balance
- balance = realized capital
- unrealized_pnl = current_position_value - entry_value
- equity = balance + unrealized_pnl
- Update equity on every tick/candle

### Risk Management
- max_drawdown = peak-to-trough equity drop
- drawdown % = (peak - trough) / peak
- stop_loss = max loss threshold
- take_profit = target gain threshold

### Position Sizing
- fixed size
- % of equity
- risk-based sizing
- Avoid risking more than 1-2% per trade

### Order Types
- Market: immediate execution
- Limit: specific price execution
- Stop: trigger at threshold
- Stop-limit: trigger + limit

### Trade Lifecycle
- Signal generated
- Order created
- Order executed
- Position opened
- Position managed
- Position closed
- PnL realized

### Backtesting vs Live
- Backtests assume ideal conditions unless simulated
- Live includes latency, slippage, partial fills
- Keep logic consistent between both

### Realtime Systems
- Events must be idempotent
- Avoid duplicate execution
- Keep engine, backend, frontend in sync

### Data Handling
- Use OHLCV candles
- Avoid lookahead bias
- Only use past data for indicators

### Indicators
- SMA, EMA, RSI, MACD, Bollinger Bands

### Strategy Types
- Trend following
- Mean reversion
- Breakout
- Momentum

### Statistics
- Expectancy = avg(win) * win_rate - avg(loss) * loss_rate
- Sharpe ratio = return / volatility
- Win rate alone is not enough

### Common Pitfalls
- Ignoring fees and spread
- Overfitting
- Lookahead bias
- Missing edge case handling

### Execution Safety
- Validate all inputs
- Avoid NaN values
- Log all trade events
- Ensure deterministic behavior

### Realtime Events
- trade
- balance
- position
- status
- candle

### System Design
- Backend is source of truth
- Engine generates events
- Frontend only displays data

### Best Practices
- Normalize prices and quantities
- Use consistent precision
- Store timestamps in UTC
- Keep logic reproducible

