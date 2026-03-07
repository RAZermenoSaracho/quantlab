# Frontend (React + Vite)

## Overview

The frontend is a React + TypeScript application powered by Vite.
It consumes backend HTTP APIs and realtime WebSocket updates to render:
- algorithms
- backtests
- paper trading runs
- charts and portfolio state

## Architecture

Main folders under `src/`:
- `pages/`: route-level screens
- `components/`: reusable UI and chart components
- `services/`: API and socket client wrappers
- `data/`: query/cache layer and data hooks
- `hooks/`: reusable UI/data hooks
- `types/` and `utils/`: local typing and helpers

## Run in Development

From repository root:

```bash
pnpm --filter frontend dev
```

## Build

```bash
pnpm --filter frontend build
```

## Environment

Used variables:
- `VITE_API_URL`
