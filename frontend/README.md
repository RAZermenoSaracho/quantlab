# Frontend

The frontend is the QuantLab web application. It is a React + TypeScript app built with Vite. It lets users create and manage algorithms, run backtests, start paper-trading sessions, monitor realtime updates, inspect charts and trades, manage profiles, and view public algorithm rankings.

The frontend talks to the Express backend over HTTP and Socket.IO. It should not call the Python engine directly.

## Responsibilities

- Public landing, login, registration, OAuth success, public profiles, and ranking views
- Authenticated dashboard and profile workflows
- Algorithm creation, editing, detail, GitHub refresh, notes, documentation, and strategy tooling
- Backtest creation, list, detail, rerun, deletion, charts, metrics, trades, and PDF export
- Paper-trading run creation, list, detail, realtime chart updates, portfolio state, trades, orders, and status
- API service wrappers and lightweight query/cache hooks
- Socket.IO subscription management for live paper-run events
- Shared UI components and chart components

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- React Router 7
- Axios
- Socket.IO client
- Monaco editor
- Tiptap rich text editor
- Recharts
- lightweight-charts
- lucide-react icons
- jsPDF and html2canvas
- `@quantlab/contracts` for shared frontend/backend types

## Source Layout

```text
frontend/src/
├── components/       # Reusable UI, charts, layout, docs, algorithm, profile, paper components
├── context/          # React context providers, including auth
├── data/             # Query/cache hooks and event bindings
├── events/           # Frontend event bus
├── hooks/            # Reusable React hooks
├── pages/            # Route-level screens
├── routes/           # Navigation and protected route configuration
├── services/         # HTTP and Socket.IO clients
├── styles/           # Theme styles
├── types/            # Frontend-local UI types
├── utils/            # Formatting, strategy params, export helpers
├── App.tsx
└── main.tsx
```

Important folders:

- `pages/algorithms/`: algorithm list, create/edit, and detail views
- `pages/backtests/`: backtest list, create, and detail views
- `pages/paper/`: paper-run list, start, and detail views
- `components/charts/`: equity curve and candlestick chart rendering
- `components/algorithms/`: code editor, strategy analyzer, docs, prompt generator, builder, config specification
- `services/`: API clients for auth, algorithms, backtests, market, optimizer, paper, and sockets
- `data/`: query/mutation hooks and cache keys

## Runtime Position in the System

```text
React UI
  -> backend HTTP API at VITE_API_URL
  -> backend Socket.IO server derived from VITE_API_URL

Backend
  -> PostgreSQL
  -> Python engine
```

The frontend receives all product data through the backend. The backend is responsible for auth, persistence, engine calls, and realtime event fanout.

## Scripts

From the repository root:

```bash
pnpm --filter frontend dev
pnpm --filter frontend build
```

From `frontend/`:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

Script behavior:

- `dev`: starts the Vite dev server
- `build`: runs TypeScript build mode and Vite production build
- `lint`: runs ESLint
- `preview`: serves a local preview of the production build

## Environment Variables

The frontend reads:

```bash
VITE_API_URL=http://localhost:5000/api
```

Usage:

- `services/api.service.ts` uses `VITE_API_URL` as the HTTP API base.
- `services/socket.service.ts` derives the Socket.IO origin by removing `/api`.
- login/register OAuth buttons derive the backend base URL from `VITE_API_URL`.

If unset, the app falls back to:

```text
HTTP API: http://localhost:5000/api
Socket.IO: http://localhost:5000
```

## Local Development

Start backend and engine first, then start the frontend:

```bash
pnpm --filter frontend dev
```

Default Vite URL:

```text
http://localhost:5173
```

For a full local stack:

```bash
docker compose up -d postgres
cd engine
uvicorn app.main:app --reload
cd ..
pnpm dev
```

`pnpm dev` from the root starts backend and frontend in parallel. The engine must be started separately.

## Routes

Routes are defined in `src/routes/navigation.tsx`.

Public routes:

- `/`
- `/login`
- `/register`
- `/oauth-success`
- `/ranking`
- `/profile/:username`
- `/algorithms/:id`
- `*`

Private routes:

- `/dashboard`
- `/profile`
- `/algorithms`
- `/algorithms/new`
- `/algorithms/:id/edit`
- `/backtests`
- `/backtests/new`
- `/backtests/:id`
- `/paper`
- `/paper/new`
- `/paper/:id`

Private routes are wrapped by `ProtectedRoute`.

## API Services

Service wrappers live in `src/services/`.

- `api.service.ts`: shared Axios instance and base URL behavior
- `auth.service.ts`: login, registration, current user, profile, password, username checks
- `algorithm.service.ts`: algorithm CRUD and ranking/runs integration
- `backtest.service.ts`: backtest create/detail/rerun/delete
- `paper.service.ts`: paper-run start/stop/restart/detail/chart/state/delete
- `market.service.ts`: symbols, fee rate, candles
- `optimizer.service.ts`: optimizer runs
- `socket.service.ts`: Socket.IO connection and event forwarding

Prefer adding API behavior to these services instead of calling Axios directly from pages.

## Data Layer

The app has a lightweight query/mutation layer under `src/data/`.

Important files:

- `keys.ts`: cache key definitions
- `queryClient.ts`: query cache client
- `useQuery.ts`: read hook
- `useMutation.ts`: mutation hook
- `eventBindings.ts`: realtime event to cache update bindings
- `algorithms.ts`, `backtests.ts`, `market.ts`, `paper.ts`: domain data hooks

When adding a new backend endpoint, usually add:

1. A service function in `src/services/`.
2. A data hook in `src/data/` if the endpoint is consumed by views.
3. A contract type from `@quantlab/contracts` if the shape is shared.

## Realtime Events

Socket behavior is centralized in `src/services/socket.service.ts`.

Frontend subscriptions use:

- `join_paper_run`
- `leave_paper_run`

Server events consumed by the frontend:

- `paper_tick`
- `trade_execution`
- `paper_run_update`
- `paper_run_status`
- `paper_run_error`
- `portfolio_update`
- `order_update`
- `backtest_progress`

Some legacy aliases may still be emitted by the backend for compatibility. Prefer the canonical contract events for new work.

When a paper-run detail page mounts, it should join that paper-run room and leave it on cleanup. This keeps updates scoped and avoids unnecessary frontend processing.

## Shared Contracts

The frontend imports domain types from `@quantlab/contracts`.

Use shared contracts for:

- API request/response types
- Backtest models
- Paper-run models
- Market/candle models
- Portfolio state
- Realtime event payloads
- Optimizer payloads
- Strategy parameter models

Use frontend-local types only for presentation state that does not cross API boundaries.

## Feature Areas

### Algorithms

The algorithm UI supports:

- Listing user algorithms
- Creating and editing Python strategy code
- Viewing public/private algorithm detail
- Strategy documentation and requirements
- Strategy prompt generation and builder tooling
- Config specification and strategy parameter helpers
- GitHub URL support and refresh behavior
- Performance score display

### Backtests

The backtest UI supports:

- Creating a backtest with exchange, symbol, timeframe, balance, dates, and fee rate
- Listing historical runs
- Viewing detail pages with metrics, trades, candles, equity curves, and analysis
- Rerunning backtests
- Deleting runs
- Exporting reports to PDF

### Paper Trading

The paper UI supports:

- Starting a paper run
- Listing paper runs
- Viewing live paper-run detail
- Candlestick chart updates
- Portfolio and balance state
- Open position state
- Trade execution updates
- Order updates
- Stop/restart behavior

### Profiles and Ranking

The frontend supports:

- User profile view/edit
- Public profile routes
- Username availability checks
- Algorithm ranking view
- Public algorithm detail views

## UI Conventions

- Keep operational trading screens dense, readable, and easy to scan.
- Use existing UI components from `components/ui/` before creating new primitives.
- Use existing chart components before adding new charting libraries.
- Use lucide-react icons when an icon is needed.
- Avoid duplicating layout shells. Use `Layout`, `PublicLayout`, `Navbar`, and `Sidebar` patterns.
- Keep trading metrics clearly labeled and consistently formatted.
- Do not hide critical statuses such as failed, stopped, active, or pending.

## Critical Areas

### Type Drift

Frontend, backend, and contracts can drift if response shapes are manually duplicated. Import shared types from `@quantlab/contracts` wherever possible.

### Realtime Consistency

Paper-run detail views depend on live events. Be careful with event names, room joins, cleanup, cache updates, and stale state after reconnects.

### Trading Display Accuracy

UI formatting must not misrepresent trading data. Be careful with:

- Percent vs decimal values
- Net vs gross PnL
- Fee-inclusive vs fee-exclusive values
- Quote/base balances
- Realized vs unrealized PnL
- Timezone/date display
- Multi-symbol display

### Auth Boundaries

Private routes require auth. Public algorithm and profile views must not expose private user-owned data.

### Large Payloads

Backtest and chart endpoints can return candles, trades, equity curves, and analysis JSON. Avoid unnecessary duplicate state and repeated expensive rendering.

## Build and Verification

Build the frontend:

```bash
pnpm --filter frontend build
```

Run lint:

```bash
pnpm --filter frontend lint
```

Build the full workspace:

```bash
pnpm build
```

When changing shared contracts, build contracts before validating the frontend:

```bash
pnpm build:contracts
pnpm build:frontend
```

## Development Guidelines

- Keep API calls inside service modules.
- Keep reusable domain fetching in `src/data/`.
- Keep route-level orchestration in `src/pages/`.
- Prefer shared contracts over duplicated local types.
- Prefer existing UI and chart components.
- Keep text and metrics readable at both desktop and mobile sizes.
- Be precise with trading labels and value formatting.
- Clean up Socket.IO room subscriptions on unmount.
- Treat failed API and realtime states as first-class UI states.
