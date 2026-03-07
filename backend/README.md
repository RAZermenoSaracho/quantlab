# Backend (Express API)

## Overview

The backend exposes QuantLab HTTP and WebSocket APIs. It coordinates:
- database persistence
- authentication/session flows
- communication with the Python engine
- realtime event fanout to frontend clients

## Architecture

`src/` is organized by responsibility:
- `controllers/`: request/response orchestration
- `services/`: external integrations and domain services
- `routes/`: route definitions and composition
- `middleware/`: auth/validation/pipeline middleware
- `utils/`: shared utilities
- `types/`: backend-local types
- `config/`: environment and framework configuration

## Run in Development

From repository root:

```bash
pnpm --filter backend dev
```

Or from `backend/`:

```bash
npm run dev
```

## Build

```bash
pnpm --filter backend build
```

## Environment Variables

Defined in `src/config/env.ts`:
- `PORT` (optional, default `5000`)
- `BACKEND_URL`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN` (optional, default `7d`)
- `SESSION_SECRET`
- `ENGINE_URL`
- `GOOGLE_CLIENT_ID` (optional)
- `GOOGLE_CLIENT_SECRET` (optional)
- `GITHUB_CLIENT_ID` (optional)
- `GITHUB_CLIENT_SECRET` (optional)
- `FRONTEND_URL`
