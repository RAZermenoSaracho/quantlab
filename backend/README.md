# Backend

The backend is the QuantLab API and orchestration layer. It exposes HTTP endpoints for the frontend, manages authentication and persistence, communicates with the Python engine, and broadcasts realtime trading events over Socket.IO.

The backend is written in TypeScript and runs on Node.js with Express.

## Responsibilities

- User registration, login, profile, OAuth, and authenticated request handling
- Algorithm CRUD and public ranking data
- Backtest creation, status tracking, reruns, detail retrieval, and deletion
- Paper trading start, stop, restart, detail, state, chart, event ingestion, and deletion
- Engine orchestration through HTTP calls
- PostgreSQL persistence for users, algorithms, runs, trades, and metrics
- Realtime event fanout to frontend clients through Socket.IO rooms
- Exchange and market metadata endpoints
- Optimizer request orchestration
- Paper-run recovery on startup

## Tech Stack

- Node.js 20+
- TypeScript
- Express 5
- PostgreSQL via `pg`
- Socket.IO
- JWT authentication
- Express session support
- Passport with Google and GitHub OAuth strategies
- bcrypt for password hashing
- Axios for engine HTTP calls
- `@quantlab/contracts` for shared API and event contracts

## Source Layout

```text
backend/src/
├── config/        # Environment, database, Passport configuration
├── controllers/   # HTTP request/response orchestration
├── middleware/    # Auth and error middleware
├── routes/        # Express route definitions
├── services/      # Domain services, engine clients, WebSocket manager, recovery
├── types/         # Backend-local TypeScript types
├── utils/         # API response, trade, date, username utilities
└── index.ts       # Express app, Socket.IO server, startup behavior
```

Important service areas:

- `pythonEngine.service.ts`: low-level engine communication
- `backtestEngine.service.ts`: backtest orchestration
- `paperEvent.service.ts`: inbound engine event handling
- `websocketManager.service.ts`: Socket.IO rooms and event broadcasts
- `paperRecovery.service.ts`: active paper-run restoration
- `runConcurrency.service.ts`: protection around concurrent run behavior
- `optimizer.service.ts`: optimizer orchestration
- `performance/`: scoring, aggregation, and metrics services
- `exchanges/`: exchange catalog/provider abstraction

## Runtime Position in the System

```text
Frontend
  -> backend HTTP API
  -> backend Socket.IO

Backend
  -> PostgreSQL
  -> Engine HTTP API

Engine
  -> backend internal event endpoint
  -> backend broadcasts to frontend
```

The backend is the only service the frontend should talk to directly for product data. The engine is an internal execution service from the frontend perspective.

## Scripts

From the repository root:

```bash
pnpm --filter backend dev
pnpm --filter backend build
```

From `backend/`:

```bash
npm run dev
npm run build
npm run start
```

Script behavior:

- `dev`: starts `ts-node-dev` with restart and transpile-only mode
- `build`: runs `tsc`
- `start`: runs compiled output from `dist/index.js`

## Environment Variables

Defined in `src/config/env.ts`.

Required:

```bash
BACKEND_URL=http://localhost:5000
DATABASE_URL=postgres://quantlab:quantlab@localhost:5432/quantlab
JWT_SECRET=replace-me
SESSION_SECRET=replace-me
ENGINE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
```

Optional:

```bash
PORT=5000
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

Notes:

- `FRONTEND_URL` is used for CORS and Socket.IO CORS.
- `ENGINE_URL` is the FastAPI engine base URL.
- `DATABASE_URL` must point to a database initialized with `database/schema.sql`.
- OAuth variables may be empty when OAuth login is not being used locally.

## Local Development

Start PostgreSQL from the repository root:

```bash
docker compose up -d postgres
```

Start the engine from `engine/`:

```bash
uvicorn app.main:app --reload
```

Start the backend:

```bash
pnpm --filter backend dev
```

Health check:

```bash
curl http://localhost:5000/health
```

The health endpoint verifies that the API is running and that PostgreSQL can respond to `SELECT NOW()`.

## HTTP API Overview

Base URL in local development:

```text
http://localhost:5000
```

### Health

- `GET /health`

### Auth

Mounted at `/api/auth`.

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/profile`
- `PUT /api/auth/profile`
- `GET /api/auth/profile/:username`
- `GET /api/auth/username-availability`
- `POST /api/auth/change-password`
- Google OAuth routes
- GitHub OAuth routes

Most account-specific routes require authentication. Public profile routes use optional auth where needed.

### Algorithms

Mounted at `/api/algorithms`.

- `GET /api/algorithms/ranking`
- `GET /api/algorithms/:id/runs`
- `POST /api/algorithms`
- `GET /api/algorithms`
- `GET /api/algorithms/:id`
- `PUT /api/algorithms/:id`
- `POST /api/algorithms/:id/refresh`
- `DELETE /api/algorithms/:id`

Algorithms store user strategy code, notes, optional GitHub URL, public/private visibility, and aggregated performance fields.

### Backtests

Mounted at `/api/backtests`.

- `GET /api/backtests/:id/status`
- `POST /api/backtests/:id/rerun`
- `GET /api/backtests`
- `POST /api/backtests`
- `GET /api/backtests/:id`
- `DELETE /api/backtests/:id`

The backend creates/persists run metadata, sends execution requests to the engine, stores returned trades/metrics/candles, and exposes detail views to the frontend.

### Paper Trading

Mounted at `/api/paper`.

- `POST /api/paper/internal/event`
- `POST /api/paper/start`
- `POST /api/paper/restart/:id`
- `POST /api/paper/stop/:id`
- `GET /api/paper`
- `GET /api/paper/:id/chart`
- `GET /api/paper/:id/state`
- `GET /api/paper/:id`
- `DELETE /api/paper/:id`

`/api/paper/internal/event` is used by the engine to post paper-trading events back to the backend. Treat it as an internal integration endpoint.

### Market

Mounted at `/api/market`.

- `GET /api/market/symbols`
- `GET /api/market/fee-rate`
- `GET /api/market/candles`

### Exchanges

Mounted at `/api/exchanges`.

- `GET /api/exchanges`

### Optimizer

Mounted at `/api/optimizer`.

- `POST /api/optimizer/run`

## WebSocket Behavior

Socket.IO is initialized in `src/index.ts` and managed through `websocketManager.service.ts`.

Frontend clients join paper-run rooms with:

- `join_paper_run`
- `leave_paper_run`

Server-to-client events include:

- `paper_tick`
- `trade_execution`
- `paper_run_update`
- `paper_run_status`
- `paper_run_error`
- `portfolio_update`
- `order_update`
- `backtest_progress`

Event payloads should be parsed or typed through `@quantlab/contracts`. When event payloads change, update contracts and frontend listeners at the same time.

## Engine Integration

The backend calls the engine for:

- Algorithm validation
- Backtest execution
- Backtest progress
- Optimizer runs
- Paper trading start/stop/status
- Market candles/history

The engine calls the backend for:

- Paper tick events
- Trade execution events
- Paper run state updates
- Paper run status/error events
- Portfolio updates
- Order updates

The backend is responsible for translating engine responses and events into persisted database records and frontend WebSocket events.

## Persistence

The database schema lives in `../database/schema.sql`.

Primary tables used by the backend:

- `users`
- `algorithms`
- `backtest_runs`
- `paper_runs`
- `trades`
- `metrics`

Important persistence rules:

- User-owned resources must be scoped by authenticated user ID unless explicitly public.
- Trading values should preserve precision. Avoid unnecessary conversion or rounding before persistence.
- `paper_runs.current_balance` exists for legacy compatibility and mirrors equity-oriented behavior.
- `paper_runs.position` stores the current open position snapshot as JSONB.
- `backtest_runs.analysis`, `equity_curve`, and `candles` are JSONB engine outputs.

## Error Handling

The backend uses centralized error middleware in `middleware/error.middleware.ts`.

Controller and service code should:

- Validate request data explicitly.
- Preserve useful error messages for expected validation failures.
- Avoid leaking secrets or stack traces in responses.
- Mark failed backtests or paper runs with the correct status when engine calls fail.

## Authentication and Authorization

Auth middleware lives in `middleware/auth.middleware.ts`.

Use:

- `requireAuth` for private routes.
- `optionalAuth` when public data can be enhanced by the current user context.

Be careful when adding routes for algorithms, backtests, paper runs, trades, or metrics. These are user-scoped by default.

## Critical Areas

### Trading Accounting

Backend persistence must not corrupt engine-calculated values. Be careful with:

- `entry_price`, `exit_price`
- `quantity`
- `entry_notional`, `exit_notional`
- `entry_fee`, `exit_fee`, `total_fee`
- `gross_pnl`, `net_pnl`, `pnl`, `pnl_percent`
- `fee_rate_used`
- `forced_close`

### Realtime Run State

Paper-run state is split between engine memory, database rows, and frontend subscriptions. Changes to paper-event handling must preserve:

- Current balances
- Last price
- Position snapshot
- Equity
- Status transitions
- Trade inserts
- Order updates
- Room-based fanout

### Recovery

Backend startup calls paper-run recovery. Avoid changes that would:

- Start duplicate engine sessions for the same active run
- Mark active runs as stopped during process restarts
- Lose engine session identifiers
- Broadcast stale state after recovery

### Contract Consistency

Do not add response or event shapes only in backend local types when the frontend consumes them. Update `@quantlab/contracts` and import from that package where appropriate.

## Build and Verification

Build the backend:

```bash
pnpm --filter backend build
```

Build the full workspace:

```bash
pnpm build
```

Before merging backend changes that affect shared behavior, also build contracts and frontend:

```bash
pnpm build:contracts
pnpm build:frontend
```

## Development Guidelines

- Keep controllers thin; put domain behavior in services.
- Keep route definitions declarative.
- Reuse shared API response utilities.
- Prefer async database and HTTP operations.
- Validate inputs before calling the engine.
- Treat engine failures as expected integration failures and persist accurate run status.
- Avoid duplicating contract types already defined in `@quantlab/contracts`.
- Do not make breaking API changes without updating frontend services and contracts.
