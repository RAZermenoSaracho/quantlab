# QuantLab

QuantLab is a SaaS algorithmic trading platform for developing, testing, ranking, and running trading strategies. It is organized as a multi-service monorepo with a React frontend, an Express backend API, a Python execution engine, shared TypeScript contracts, and PostgreSQL persistence.

The project prioritizes correctness in trading logic. PnL, fees, execution prices, slippage, balances, positions, and realtime run state are the areas where regressions are most costly.

## What QuantLab Does

QuantLab supports the full lifecycle of a strategy:

1. Create or import Python strategy code.
2. Validate the strategy before execution.
3. Run historical backtests against exchange candle data.
4. Inspect backtest metrics, trades, candles, equity curves, and portfolio summaries.
5. Start realtime paper-trading runs.
6. Receive live paper-run updates over WebSocket.
7. Track algorithm performance and public ranking data.
8. Persist users, algorithms, runs, trades, metrics, balances, and positions in PostgreSQL.

## Architecture

```text
Frontend (React + Vite + TypeScript)
        |
        | HTTP API + Socket.IO
        v
Backend (Express + TypeScript)
        |
        | HTTP engine API
        v
Engine (FastAPI + Python strategy runtime)

Shared TypeScript contracts:
packages/contracts
  -> imported by backend and frontend

Persistence:
PostgreSQL
  -> users, algorithms, backtests, paper runs, trades, metrics
```

## Repository Layout

```text
quantlab/
├── backend/               # Express API, auth, persistence, orchestration, WebSocket fanout
├── frontend/              # React + Vite app for strategy management and monitoring
├── engine/                # Python FastAPI execution engine for validation/backtests/paper trading
├── packages/contracts/    # Shared TypeScript/Zod contracts used by frontend and backend
├── database/              # PostgreSQL schema and DB-related assets
├── .github/workflows/     # CI pipeline
├── docker-compose.yml     # Local PostgreSQL service
├── package.json           # Root workspace scripts
└── pnpm-workspace.yaml    # pnpm workspace package list
```

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Socket.IO client
- Axios
- Monaco editor
- Recharts and lightweight-charts
- Tiptap editor
- jsPDF and html2canvas for exports

### Backend

- Node.js 20+
- TypeScript
- Express 5
- PostgreSQL via `pg`
- Socket.IO
- JWT authentication
- Express sessions and Passport OAuth
- Axios for engine communication
- bcrypt for password hashing

### Engine

- Python 3.11+
- FastAPI
- Pydantic
- Uvicorn
- asyncpg
- httpx
- python-binance

### Shared Contracts

- TypeScript
- Zod schemas
- Workspace package: `@quantlab/contracts`

### Infrastructure

- PostgreSQL 15 for local development through Docker Compose
- pnpm workspaces
- GitHub Actions CI

## Prerequisites

- Node.js 20+
- pnpm 10+
- Python 3.11+
- Docker, for local PostgreSQL

## Installation

Install JavaScript workspace dependencies from the repository root:

```bash
pnpm install
```

Install Python engine dependencies from `engine/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Local Database

Start PostgreSQL:

```bash
docker compose up -d postgres
```

The local Docker service uses:

- Host: `localhost`
- Port: `5432`
- Database: `quantlab`
- User: `quantlab`
- Password: `quantlab`

The schema is defined in `database/schema.sql`. It includes users, algorithms, backtest runs, paper runs, trades, and metrics.

## Environment Variables

The backend requires the following variables:

```bash
PORT=5000
BACKEND_URL=http://localhost:5000
DATABASE_URL=postgres://quantlab:quantlab@localhost:5432/quantlab
JWT_SECRET=replace-me
JWT_EXPIRES_IN=7d
SESSION_SECRET=replace-me
ENGINE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

The frontend uses:

```bash
VITE_API_URL=http://localhost:5000/api
```

The engine currently uses:

```bash
DATABASE_URL=postgres://quantlab:quantlab@localhost:5432/quantlab
BACKEND_URL=http://localhost:5000
PAPER_STRATEGY_FATAL=false
```

`DATABASE_URL` is needed by the engine for paper-run recovery. `BACKEND_URL` is used when emitting paper/backtest events back to the backend.

## Running Locally

Start the engine from `engine/`:

```bash
uvicorn app.main:app --reload
```

Start backend and frontend from the repository root:

```bash
pnpm dev
```

Useful root commands:

```bash
pnpm dev:backend
pnpm dev:frontend
pnpm build
pnpm build:contracts
pnpm build:backend
pnpm build:frontend
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000`
- Backend health: `http://localhost:5000/health`
- Engine API: `http://localhost:8000`
- Engine health: `http://localhost:8000/health`

## Runtime Data Flow

### Backtest Flow

1. The frontend creates a backtest through the backend API.
2. The backend persists a `backtest_runs` record with status metadata.
3. The backend sends strategy code, market configuration, balance, dates, and fee data to the engine.
4. The engine validates inputs, fetches or prepares candles, simulates execution, computes trades and metrics, and returns results.
5. The backend persists trades, metrics, candles, analysis JSON, and run status.
6. The frontend displays the backtest detail view with charts, trades, and performance metrics.

### Paper Trading Flow

1. The frontend starts a paper run through the backend API.
2. The backend persists the `paper_runs` record and calls the engine.
3. The engine creates an in-memory paper session, hydrates candle history, subscribes to market streams, dispatches strategy events, and simulates order execution.
4. The engine posts internal events back to the backend.
5. The backend updates persistent paper-run state and broadcasts Socket.IO events to subscribed frontend clients.
6. The frontend joins the paper-run room and updates charts, trades, portfolio state, orders, balances, and status in realtime.

### Recovery Flow

Both backend and engine include paper-run recovery behavior. On startup, active paper runs can be restored so process restarts do not incorrectly mark runs as stopped. Engine shutdown intentionally avoids calling paper session `stop()` because that would emit user-stop events during a process restart.

## Shared Contracts

The `packages/contracts` package is the source of truth for frontend/backend API and event types. It contains Zod schemas and inferred TypeScript types for:

- Common API wrappers
- Auth
- Algorithms
- Backtests
- Paper runs
- Market data
- Portfolio state
- Realtime events
- Engine payloads
- Optimizer payloads
- Strategy parameters

When backend response shapes, WebSocket payloads, or frontend service types change, update contracts first or in the same change. Avoid duplicating cross-layer types locally.

## Database Model

Core tables:

- `users`: accounts, usernames, password hashes
- `algorithms`: user strategy code, notes, GitHub URL, public flag, aggregated performance fields
- `backtest_runs`: historical run configuration, status, engine analysis, candles, equity curve
- `paper_runs`: active/stopped paper sessions, balances, equity, position, engine session metadata
- `trades`: normalized trade records for backtest and paper runs
- `metrics`: run-level performance metrics and equity curve snapshots

Important numeric fields use PostgreSQL `NUMERIC` for trading values such as balances, prices, quantities, fees, and PnL.

## Critical Engineering Areas

### Trading Accounting

This is the highest-risk part of the system. Changes to the engine or persistence layer must preserve:

- Gross and net PnL
- Entry and exit fees
- Fee-rate propagation
- Quantity and notional calculations
- Forced close behavior
- Open position valuation
- Realized and unrealized PnL
- Quote/base balances
- Equity curve generation
- Drawdown and return calculations

### Execution Simulation

Execution behavior spans the engine execution and portfolio modules. Be careful with:

- Slippage models
- Spread models
- Intrabar risk exits
- Market, limit, stop, and stop-limit order behavior
- Multi-symbol handling
- Position scaling
- Cooldown logic

### Realtime Events

Socket.IO event names and payloads must stay aligned across engine, backend, contracts, and frontend. Important events include:

- `paper_tick`
- `trade_execution`
- `paper_run_update`
- `paper_run_status`
- `paper_run_error`
- `portfolio_update`
- `order_update`
- `backtest_progress`

### Type Consistency

The project uses TypeScript for frontend/backend and Python for the engine. Keep shared frontend/backend types in `@quantlab/contracts`, validate inputs explicitly, and avoid changing response shapes without updating callers.

### Auth and Ownership

Most application routes are user-scoped. Ensure authenticated routes protect private resources and that optional public routes do not leak private algorithm or run data.

### Recovery and Concurrency

Paper runs are long-lived. Avoid duplicate active sessions for the same run, accidental stop events during restarts, and stale persisted state after engine/backend failures.

## Testing and Validation

Current root build command:

```bash
pnpm build
```

This builds contracts, backend, and frontend in sequence.

Engine tests live in `engine/tests/` and currently cover critical trading behavior such as accounting, slippage, and execution pipeline logic. If you change execution, portfolio, or PnL code, run the engine tests in addition to TypeScript builds.

## CI

The CI pipeline is defined in `.github/workflows/ci.yml`. The documented pipeline performs:

- Workspace dependency installation
- Contracts build
- Backend build
- Frontend build

Because contracts are built first, frontend and backend compile against the shared public package output.

## Development Guidelines

- Prefer simple, maintainable changes over clever abstractions.
- Reuse existing services, controllers, contracts, and engine modules before adding new ones.
- Keep functions small and testable.
- Keep async code non-blocking where possible.
- Validate external inputs explicitly.
- Treat trading values carefully. Rounding, decimal precision, and fee timing matter.
- Do not break shared API or event contracts without updating all consumers.
- For frontend/backend domain models, prefer `@quantlab/contracts` imports over duplicated local types.

## Environment READMEs

Each major environment has its own README with more specific details:

- `backend/README.md`
- `frontend/README.md`
- `engine/README.md`
- `packages/contracts/README.md`
