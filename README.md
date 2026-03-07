## QuantLab

QuantLab is an algorithmic trading platform with:
- a React frontend for strategy management and monitoring
- an Express backend API for orchestration and persistence
- a Python engine for backtesting and paper trading
- a shared contracts package for cross-layer typing

## Architecture

```text
Frontend (React/Vite)
        |
        | HTTP + WebSocket
        v
Backend (Express)
        |
        | HTTP (engine API)
        v
Engine (FastAPI + strategy runtime)

Shared types:
packages/contracts
  -> imported by backend + frontend
```

## Repository Layout

```text
quantlab/
├ backend/               # Express API
├ frontend/              # React + Vite app
├ engine/                # Python execution engine
├ packages/contracts/    # Shared TypeScript contracts
├ database/              # DB-related assets
├ .github/workflows/     # CI
├ docker-compose.yml
└ pnpm-workspace.yaml
```

## Prerequisites

- Node.js 20+
- pnpm 10+
- Python 3.11+ (for `engine`)

## Install Dependencies

```bash
pnpm install
```

## Run Locally

From repository root:

```bash
pnpm dev
```

This starts backend and frontend in parallel.

Useful root commands:

```bash
pnpm dev:backend
pnpm dev:frontend
pnpm build
pnpm build:contracts
pnpm build:backend
pnpm build:frontend
```

## Engine Integration

- Backend calls engine HTTP endpoints for backtests and paper runs.
- Engine emits paper/backtest updates to backend internal endpoints.
- Backend broadcasts updates to frontend via WebSocket.

## CI Overview

CI pipeline runs in `.github/workflows/ci.yml` and performs:
- workspace dependency installation
- contracts build
- backend build
- frontend build
