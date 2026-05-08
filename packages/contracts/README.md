# @quantlab/contracts

`@quantlab/contracts` is QuantLab's shared TypeScript contract package. It provides Zod schemas and inferred TypeScript types used by the frontend and backend to keep API payloads, domain entities, and realtime event shapes consistent.

This package is the primary defense against type drift between the React app and Express API.

## Responsibilities

- Define shared domain models
- Define API request and response shapes
- Define realtime Socket.IO payload types
- Define strategy parameter contracts
- Provide runtime schemas through Zod
- Provide TypeScript types inferred from those schemas
- Export a single package API consumed by frontend and backend

## Tech Stack

- TypeScript
- Zod
- pnpm workspace package
- CommonJS build output

## Package Metadata

Package name:

```text
@quantlab/contracts
```

Build output:

```text
dist/index.js
dist/index.d.ts
```

The package is imported by workspace packages using:

```ts
import type { Algorithm, BacktestRun } from "@quantlab/contracts";
```

Do not import contract files through cross-package relative paths.

## Source Layout

```text
packages/contracts/src/
├── algorithm.ts
├── auth.ts
├── backtest.ts
├── common.ts
├── engine.ts
├── events.ts
├── index.ts
├── market.ts
├── optimizer.ts
├── paper.ts
├── portfolio.ts
└── strategyParameters.ts
```

`src/index.ts` re-exports all contract modules.

## Scripts

From the repository root:

```bash
pnpm --filter @quantlab/contracts build
```

From `packages/contracts/`:

```bash
npm run build
```

The package currently has a placeholder `test` script and no dedicated contract test suite.

## Module Overview

### `common.ts`

Shared primitives and API wrapper types. Use this for common success/error shapes, reusable identifiers, and generic response contracts.

### `auth.ts`

Authentication and user-related contracts. Use this for login, registration, profile, current-user, and auth response shapes.

### `algorithm.ts`

Algorithm domain contracts. Use this for strategy code records, algorithm metadata, public/private algorithm views, ranking data, and algorithm-related API payloads.

### `backtest.ts`

Backtest contracts. Includes:

- Backtest status
- Backtest run entity
- Backtest analysis JSON
- Backtest trades
- Metrics
- Portfolio summary
- Create/start backtest requests
- List/status/detail responses

Backtest contracts are high impact because they connect frontend forms, backend controllers, database records, and engine results.

### `paper.ts`

Paper-trading contracts. Includes:

- Paper-run status
- Paper position
- Paper trade
- Paper order
- Paper run entity
- Paper run detail response
- Chart response
- Start paper run request/response
- Engine-to-backend paper payloads

Paper contracts are critical for live run detail screens and backend event persistence.

### `market.ts`

Market data contracts. Use this for candles, timeframes, symbols, and exchange market data payloads.

### `portfolio.ts`

Portfolio state contracts. Use this for balances, equity, positions, and portfolio update event payloads.

### `events.ts`

Realtime event contracts shared by backend and frontend.

Server-to-client events include:

- `paper_tick`
- `trade_execution`
- `paper_run_update`
- `paper_run_status`
- `paper_run_error`
- `portfolio_update`
- `order_update`
- `backtest_progress`

Client-to-server events include:

- `join_paper_run`
- `leave_paper_run`

### `engine.ts`

Engine integration contracts. Use this for backend-to-engine and engine response payloads where TypeScript callers need shared structure.

### `optimizer.ts`

Optimizer request and response contracts. Use this for parameter-space optimization payloads and results.

### `strategyParameters.ts`

Strategy parameter contracts. Use this for strategy configuration and parameter definitions that need to be shared between UI and backend logic.

## Usage Guidelines

### Import From the Package Name

Good:

```ts
import type { PaperRun, TradeExecution } from "@quantlab/contracts";
```

Avoid:

```ts
import type { PaperRun } from "../../packages/contracts/src/paper";
```

Cross-package relative imports bypass the package boundary and can break builds or create duplicate type assumptions.

### Export New Contracts Through `index.ts`

If you add a new file or schema, export it from `src/index.ts` so consumers can import from `@quantlab/contracts`.

### Keep Runtime Schemas and Types Together

Preferred pattern:

```ts
export const ExampleSchema = z.object({
  id: z.string().uuid(),
  value: z.number(),
});

export type Example = z.infer<typeof ExampleSchema>;
```

This keeps runtime validation and compile-time typing aligned.

### Be Explicit About Optional and Nullable

Use optional and nullable intentionally:

- `.optional()` means the property may be absent.
- `.nullable()` means the property is present or allowed with `null`.
- `.nullable().optional()` means both absence and `null` are allowed.

This matters because backend database values, engine outputs, and frontend rendering often differ in how missing values appear.

### Prefer Schema Reuse

Reuse existing schemas such as candle, portfolio, paper position, and market timeframe schemas when building larger response schemas. Avoid redefining the same field constraints in multiple modules.

## Contract Change Workflow

When changing a shared API or event shape:

1. Update or add the Zod schema in `packages/contracts/src/`.
2. Export the schema/type from `src/index.ts`.
3. Update backend controllers/services to parse or type against the contract.
4. Update frontend services/data hooks/components to consume the new type.
5. Build contracts.
6. Build backend.
7. Build frontend.

Commands:

```bash
pnpm build:contracts
pnpm build:backend
pnpm build:frontend
```

Or:

```bash
pnpm build
```

## Versioning and Compatibility

This is an internal workspace package, but contract changes still have compatibility implications:

- Removing fields can break existing frontend views.
- Renaming fields can break API clients and cache updates.
- Narrowing enums can reject existing database or engine values.
- Changing event payloads can break realtime paper-run screens.
- Changing numeric meaning can misrepresent trading performance.

Prefer additive changes when possible, then remove old fields only after all consumers are updated.

## Critical Areas

### Trading Values

Contracts involving prices, balances, quantities, fees, and PnL are high-risk. Be careful with:

- `entry_price`
- `exit_price`
- `quantity`
- `entry_notional`
- `exit_notional`
- `entry_fee`
- `exit_fee`
- `total_fee`
- `gross_pnl`
- `net_pnl`
- `pnl`
- `pnl_percent`
- `fee_rate_used`
- `equity`
- `quote_balance`
- `base_balance`

### Realtime Events

The `events.ts` module defines the frontend/backend event contract. Event name changes must be coordinated with:

- Backend `websocketManager.service.ts`
- Frontend `socket.service.ts`
- Frontend paper-run subscriptions
- Frontend cache/event bindings

### Status Enums

Backtest and paper status enums must match database enum values and backend/engine behavior.

Backtest status:

- `PENDING`
- `RUNNING`
- `COMPLETED`
- `FAILED`

Paper status:

- `ACTIVE`
- `PAUSED`
- `STOPPED`

### Market Timeframes

Timeframe contracts should remain aligned with backend validation, frontend forms, engine market fetching, and exchange support.

## Development Guidelines

- Keep contracts domain-focused and stable.
- Do not include frontend presentation-only types unless they cross an API boundary.
- Do not include backend-private implementation details unless clients need them.
- Keep schema names consistent: `ThingSchema` plus `Thing` type.
- Use Zod validation for externally received data where practical.
- Avoid duplicating contracts in backend or frontend local folders.
- Build contracts before building dependent packages after changes.
