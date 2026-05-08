# Engine

The engine is QuantLab's Python execution service. It validates strategy code, runs historical backtests, manages realtime paper-trading sessions, processes market data, dispatches strategy events, simulates execution, tracks portfolio state, and emits runtime events back to the backend.

The engine is written in Python and exposed through FastAPI.

## Responsibilities

- Validate user strategy code before execution
- Run historical backtests
- Run optimizer sweeps over strategy parameter spaces
- Start, stop, recover, and reconcile paper-trading sessions
- Subscribe to market streams and hydrate candle history
- Dispatch strategy events through worker pipelines
- Simulate order execution, slippage, spreads, and fills
- Maintain portfolio balances, positions, equity, PnL, and orders
- Emit paper/backtest updates to the backend
- Fetch market candles and history for backend requests

## Tech Stack

- Python 3.11+
- FastAPI
- Pydantic 2
- Uvicorn
- asyncpg
- httpx
- python-binance
- python-dotenv

## Source Layout

```text
engine/
├── app/
│   ├── clients/       # Exchange client abstractions and Binance implementation
│   ├── data/          # Candle aggregation helpers
│   ├── events/        # Strategy event registry, queue, and worker pipeline
│   ├── execution/     # Execution price, slippage, spread models
│   ├── market/        # Market stream registry, stream manager, candle aggregation
│   ├── portfolio/     # Portfolio state, accounting, fee model, portfolio engine
│   ├── backtest.py    # Historical simulation pipeline
│   ├── context.py     # Strategy runtime context
│   ├── indicators.py  # Indicator helpers
│   ├── main.py        # FastAPI app, routes, lifecycle, recovery
│   ├── metrics.py     # Performance metrics
│   ├── optimizer.py   # Parameter optimization
│   ├── paper_trading.py
│   ├── spec.py
│   └── validator.py
├── examples/          # Example strategies
├── tests/             # Engine tests for accounting, slippage, execution
└── requirements.txt
```

## Runtime Position in the System

```text
Backend
  -> Engine FastAPI endpoints

Engine
  -> Exchange clients for market data
  -> PostgreSQL for paper-run recovery
  -> Backend internal endpoints for paper/backtest events
```

The frontend does not call the engine directly. The backend is responsible for creating persisted run records and translating engine results/events into API responses and WebSocket broadcasts.

## Installation

From `engine/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Running Locally

From `engine/`:

```bash
uvicorn app.main:app --reload
```

Default local URL:

```text
http://localhost:8000
```

Health check:

```bash
curl http://localhost:8000/health
```

## Environment Variables

Currently used by engine runtime:

```bash
DATABASE_URL=postgres://quantlab:quantlab@localhost:5432/quantlab
BACKEND_URL=http://localhost:5000
PAPER_STRATEGY_FATAL=false
```

Notes:

- `DATABASE_URL` is used for recovery of active paper runs on engine startup and reconciliation.
- If `DATABASE_URL` is missing, paper-run recovery is disabled and the engine logs a warning.
- `BACKEND_URL` is used by paper trading to emit internal events back to the backend. It defaults to `http://localhost:5000` in paper-trading code when missing.
- `PAPER_STRATEGY_FATAL` controls optional paper strategy failure behavior.

Backtest, optimizer, and paper requests may also include exchange API credentials:

- `api_key`
- `api_secret`
- `testnet`

These are request fields rather than global environment variables in the current engine API.

## FastAPI Endpoints

### Health

- `GET /health`

Returns engine status.

### Strategy Validation

- `POST /validate`

Request:

```json
{
  "code": "python strategy code"
}
```

The validator parses and checks strategy code before execution. It rejects unsafe imports, unsafe calls, unsafe names, dunder attribute access, and other forbidden constructs.

### Backtests

- `POST /backtests`
- `GET /backtest-progress/{run_id}`

Backtest request fields:

- `code`
- `exchange`
- `symbol`
- `timeframe`
- `initial_balance`
- `start_date`
- `end_date`
- `fee_rate`
- `run_id`
- `api_key`
- `api_secret`
- `testnet`

Dates must be ISO format. `initial_balance` must be positive. `fee_rate`, when provided, must be non-negative.

The backtest route runs the simulation in a worker thread through `asyncio.to_thread` to avoid blocking the FastAPI event loop.

### Optimizer

- `POST /optimizer/run`

Optimizer request fields:

- `code`
- `exchange`
- `symbol`
- `timeframe`
- `initial_balance`
- `start_date`
- `end_date`
- `param_space`
- `fee_rate`
- `api_key`
- `api_secret`
- `testnet`

The optimizer generates parameter candidates, runs backtests, extracts metrics, and returns optimization results.

### Paper Trading

- `POST /paper/start`
- `POST /paper/stop/{run_id}`
- `GET /paper/status/{run_id}`

Paper start request fields:

- `run_id`
- `code`
- `exchange`
- `symbol`
- `timeframe`
- `initial_balance`
- `fee_rate`
- `api_key`
- `api_secret`
- `testnet`

The engine keeps active paper sessions in memory under `ACTIVE_PAPER_SESSIONS`. It prevents starting a duplicate session for the same `run_id`.

### Market Data

- `GET /market/history`
- `GET /market/candles`

`/market/history` gets recent stream-managed history.

`/market/candles` fetches exchange candles for a date range. For sub-minute timeframes such as `1s`, `5s`, `15s`, and `30s`, the engine fetches `1m` source candles and expands them to the requested sub-minute interval.

## Backtest Pipeline

The backtest pipeline is implemented in `app/backtest.py`.

Core responsibilities:

- Normalize symbols and fetched candles
- Prepare market data
- Resolve execution prices
- Open positions
- Add to positions
- Close positions
- Apply fee metrics
- Compute unrealized PnL
- Check intrabar risk exits
- Track capital deployed
- Compute portfolio valuation
- Generate trades, metrics, analysis, candles, and equity data

High-risk functions include:

- `_resolve_execution_price`
- `_position_with_fee_metrics`
- `_open_position`
- `_add_to_position`
- `_close_position`
- `_check_intrabar_risk_exit`
- `_compute_portfolio_valuation`
- `run_backtest`

Changes here should be tested carefully because small accounting changes affect user-visible PnL and rankings.

## Paper-Trading Runtime

Paper trading is implemented in `app/paper_trading.py`.

Core behavior:

- Build a `PaperSession` from backend request data
- Hydrate recent candle history
- Subscribe to market candle streams
- Normalize raw strategy signals
- Create, fill, and cancel simulated orders
- Open and close simulated positions
- Maintain quote/base balances
- Maintain portfolio state and equity curve
- Emit tick, trade, portfolio, order, status, and error events to backend

Paper sessions are long-lived and stateful. Be careful with startup, shutdown, reconnection, and duplicate session handling.

## Startup, Shutdown, and Recovery

Startup behavior in `app/main.py`:

1. Starts strategy event workers.
2. Attempts to restore active paper runs from PostgreSQL.
3. Starts a reconciliation loop.

Recovery queries active/running paper runs from the database and rebuilds missing in-memory paper sessions.

Shutdown behavior intentionally does not call `session.stop()` for active paper sessions. Calling stop would emit STOPPED events to the backend and incorrectly mark runs as user-stopped during engine restarts. Shutdown clears in-memory references and stops background resources.

## Strategy Event System

The event system lives in `app/events/`.

Key files:

- `strategy_registry.py`
- `event_queue.py`
- `strategy_worker.py`

The engine starts a default number of strategy workers on startup. Workers process strategy events and dispatch strategy logic without blocking the main event loop.

## Market System

Market functionality lives in `app/market/` and `app/data/`.

Important modules:

- `market_stream.py`: stream behavior
- `market_registry.py`: stream manager registry
- `candle_aggregator.py`: candle aggregation
- `data/candle_aggregator.py`: sub-minute expansion helpers

Market data is used by both paper trading and backend market endpoints.

## Execution and Portfolio Accounting

Execution behavior lives in `app/execution/`.

Important modules:

- `price_pipeline.py`
- `slippage_model.py`
- `volume_slippage_model.py`
- `spread_model.py`

Portfolio behavior lives in `app/portfolio/`.

Important modules:

- `portfolio_engine.py`
- `portfolio_state.py`
- `fee_model.py`

These modules are critical for:

- Fill prices
- Spread application
- Slippage application
- Fee calculation
- Position sizing
- Quote/base balances
- Realized and unrealized PnL
- Equity and mark-to-market valuation

## Strategy Validation

Validation is implemented in `app/validator.py`.

The validator checks:

- Forbidden imports
- Infinite loop risks
- Forbidden calls
- Forbidden names
- Dunder attribute access
- Config AST validity

It also provides safe helper functions and dummy candles for validation-time strategy execution. Keep validation strict enough to protect runtime stability, but consistent with documented strategy capabilities.

## Events Emitted to Backend

Paper trading emits events to the backend internal endpoint. Event categories include:

- Tick/candle updates
- Trade executions
- Paper-run balance/equity/position updates
- Status changes
- Error notifications
- Portfolio state updates
- Order created/filled/cancelled updates

These are eventually broadcast by the backend to frontend Socket.IO clients. Payload shape changes should be coordinated with backend handling and `@quantlab/contracts`.

## Tests

Engine tests live in `engine/tests/`.

Current test areas:

- `test_trade_accounting.py`
- `test_slippage_model.py`
- `test_execution_pipeline.py`

Run tests from `engine/` with the project test runner available in your environment, for example:

```bash
pytest
```

If `pytest` is not installed in the active environment, install the test dependency before running tests.

## Critical Areas

### PnL and Fees

Trading accounting must be exact and consistent across backtest and paper trading. Be careful with:

- Entry fees
- Exit fees
- Total fees
- Gross PnL
- Net PnL
- PnL percent
- Fee-rate propagation
- Forced close trades
- Position scaling

### Execution Prices

Execution price changes can alter every downstream metric. Validate changes to:

- Slippage
- Spread
- Intrabar exits
- Market price resolution
- Stop and limit behavior
- Multi-symbol execution

### Portfolio State

Portfolio state must stay internally consistent:

- Quote balance
- Base balance
- Last price
- Equity
- Position
- Orders
- Realized PnL
- Unrealized PnL

### Realtime Sessions

Paper sessions are stateful and long-running. Avoid:

- Duplicate active sessions for the same run
- Losing active sessions during restarts
- Incorrect STOPPED events during shutdown
- Emitting stale portfolio state
- Blocking the event loop with long CPU-bound strategy work

### Backend Contract

The engine is Python, but frontend/backend contracts are TypeScript. When engine response/event shapes change, update:

- Backend engine types and event handling
- Backend persistence mapping
- `@quantlab/contracts`
- Frontend services and realtime listeners

## Development Guidelines

- Keep execution and accounting logic deterministic and testable.
- Prefer explicit validation over permissive behavior.
- Use async I/O for network and database operations.
- Use `asyncio.to_thread` for blocking CPU/sync exchange operations when needed.
- Avoid changing shutdown semantics without considering paper-run recovery.
- Add or update tests for any accounting, execution, slippage, spread, or portfolio change.
- Keep Python strategy runtime behavior aligned with frontend strategy documentation.
