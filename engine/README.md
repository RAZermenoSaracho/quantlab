# Engine (Python)

## Overview

The engine is responsible for:
- strategy validation
- backtest execution
- paper trading runtime
- market stream processing and strategy dispatch

It exposes an HTTP API (FastAPI) consumed by the backend.

## Responsibilities

- `backtest.py`: historical simulation pipeline
- `paper_trading.py`: realtime paper run lifecycle and event emission
- `market/`: market stream management and candle history
- `events/`: strategy event dispatch/worker pipeline
- `clients/`: exchange integrations

## Run in Development

From `engine/`:

```bash
uvicorn app.main:app --reload
```

## Backend Communication

- Backend calls engine endpoints (start/stop paper runs, backtests, validation).
- Engine posts internal paper/backtest events back to backend.
- Backend then forwards realtime events to frontend WebSocket clients.

## Environment

Currently used in engine runtime:
- `BACKEND_URL` (default `http://localhost:5000` if missing in paper trading)
- `PAPER_STRATEGY_FATAL` (optional behavior flag)
