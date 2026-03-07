# @quantlab/contracts

## Overview

This package is the shared contract layer for QuantLab.
It provides common TypeScript types and schemas used by:
- backend (API request/response typing and validation)
- frontend (service and UI typing)

The goal is end-to-end type consistency across the stack.

## Why It Exists

Without a shared contract package, frontend and backend models drift.
`@quantlab/contracts` keeps a single source of truth for:
- domain entities
- API wrappers and payloads
- event payload schemas

## Usage

Import from package name:

```ts
import type { Algorithm, ApiSuccess } from "@quantlab/contracts";
```

Do not import from local relative paths across packages.

## Build

From repository root:

```bash
pnpm --filter @quantlab/contracts build
```

Build output:
- JS: `dist/index.js`
- types: `dist/index.d.ts`
