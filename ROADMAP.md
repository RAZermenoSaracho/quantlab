# QuantLab Roadmap

## Current State Summary

QuantLab is a working algorithmic trading research application organized as a pnpm monorepo:

- `frontend/`: React 19 + Vite app with authenticated research pages for algorithms, backtests, paper runs, profiles, rankings, charts, and strategy authoring.
- `backend/`: Express/TypeScript API that handles authentication, PostgreSQL persistence, strategy orchestration, engine calls, performance scoring, and Socket.IO event fanout.
- `engine/`: FastAPI Python strategy runtime for validation, backtesting, optimization, paper trading, market streams, execution modeling, and portfolio accounting.
- `packages/contracts/`: shared TypeScript/Zod contracts used by backend and frontend.
- `database/schema.sql`: single PostgreSQL schema containing users, algorithms, backtest runs, paper runs, trades, and metrics.
- `docker-compose.yml`: local Postgres only. Backend, frontend, and engine are not yet containerized in the compose stack.

The current product already has useful research primitives: strategy creation, GitHub import, algorithm validation, backtests, optimizer runs, paper trading, WebSocket updates, public profiles, and a ranking page. The strongest technical foundations are the clear service split, shared contracts package, Python strategy validation, event-driven paper trading path, and detailed accounting fields for trades and metrics.

The major gaps are production boundaries: the system is single-database, has no migration framework, has no explicit tenant model, stores public/private data in the same operational tables, has no control-plane database, has no tenant provisioning workflow, has limited backend test coverage, has no container image strategy for the API/frontend/engine, and the engine still reads the shared `DATABASE_URL` directly for paper-run recovery.

## Product Vision

QuantLab should become a quantitative trading research suite and SaaS platform where users can:

- Build, validate, version, and document Python trading strategies.
- Run reproducible backtests across exchanges, symbols, timeframes, and parameter sets.
- Run paper trading sessions with realistic execution, fees, slippage, and portfolio accounting.
- Compare strategies using normalized performance, risk, confidence, and robustness metrics.
- Publish selected research outputs to a public/community layer without leaking private tenant data.
- Upgrade from a free isolated research workspace into paid tiers with more compute, storage, paper sessions, datasets, collaboration, and AI assistance.

The long-term platform should feel closer to an Odoo-style SaaS architecture than a typical shared-table app: each user or subscription gets an isolated tenant database and eventually an isolated runtime boundary, while the global platform provides identity, billing, provisioning, routing, observability, and public discovery.

## Architecture Vision

Target architecture:

- **Control plane**: global platform database and API for users, organizations, subscriptions, tenant registry, billing state, feature flags, public catalog records, audit trails, and provisioning metadata.
- **Tenant plane**: one isolated PostgreSQL database per tenant containing algorithms, private backtests, private paper runs, trades, metrics, tenant settings, and tenant-local users/collaborators where needed.
- **Runtime plane**: backend and engine services can resolve a tenant from auth/subdomain/header, connect only to that tenant database, and run tenant-scoped jobs.
- **Execution plane**: backtests, optimizations, and paper trading should run through explicit job/session records and eventually through queues or worker containers instead of long request-coupled work.
- **Public/community plane**: a separate shared database or schema containing only user-published snapshots, summaries, sanitized metadata, and public profile records.

Initial implementation should not jump directly to full container-per-tenant. First create tenant abstractions and a control-plane registry, then migrate from single shared database to per-tenant databases, then isolate runtime containers for higher tiers and active paper trading.

## Multi-Tenant SaaS Strategy

QuantLab should move through three tenancy stages:

1. **Tenant-aware monolith**
   - Add `tenants`, `tenant_memberships`, and `tenant_database_connections` to a control-plane schema.
   - Keep one app deployment, but require all tenant-scoped requests to resolve a tenant context.
   - Introduce a `TenantDbProvider` in the backend and remove direct imports of the global `pool` from feature controllers over time.

2. **Database-per-tenant**
   - Provision a PostgreSQL database per user/subscription.
   - Run the same tenant schema in every tenant database.
   - Keep auth, billing, tenant registry, and public catalog in the control plane.
   - Ensure backend, engine, and jobs receive tenant identity and tenant database connection through trusted server-side resolution only.

3. **Runtime-per-tenant**
   - Run isolated backend/engine workers per tenant or per active paid tenant group.
   - Start with shared API plus isolated engine worker pools; move active paper tenants to dedicated containers when reliability and cost justify it.
   - Add resource quotas, CPU/memory limits, network restrictions, and per-tenant secrets scopes.

Tenant data must never be selected directly into public pages. Public pages should read from explicit publish tables populated by user action.

## Per-User Database Strategy

Recommended database split:

- **Control database**
  - `users`
  - `oauth_identities`
  - `subscriptions`
  - `tenants`
  - `tenant_memberships`
  - `tenant_databases`
  - `tenant_runtime_instances`
  - `public_profiles`
  - `published_algorithms`
  - `published_backtest_summaries`
  - `published_strategy_metrics`
  - `audit_events`

- **Tenant database**
  - Current research tables: `algorithms`, `backtest_runs`, `paper_runs`, `trades`, `metrics`
  - Future tables: `strategy_versions`, `datasets`, `market_data_cache`, `job_runs`, `optimizer_runs`, `paper_events`, `notebooks`, `research_projects`, `broker_connections`, `api_keys`

Migration path:

- Add migration tooling before further schema work.
- Rename the current `database/schema.sql` into an initial migration.
- Create repeatable tenant schema migrations.
- Build tenant provisioning that creates a database, applies migrations, creates least-privilege credentials, and registers the database in the control plane.
- Write an export/import migration path from the current single database into one tenant database per existing user.

## Container-Per-Tenant Strategy

Container isolation should be introduced gradually:

- **Local development**: expand `docker-compose.yml` to run Postgres, backend, engine, and frontend with safe development defaults.
- **MVP SaaS**: shared backend/API container, shared engine worker pool, per-tenant databases.
- **Paid/research tier**: dedicated engine worker containers for long-running paper sessions and high-cost optimizations.
- **Enterprise tier**: dedicated backend + engine + database runtime per organization.

Each tenant runtime should have:

- Tenant-scoped service credentials.
- No access to other tenant database URLs.
- CPU, memory, process, and timeout limits.
- Read-only strategy runtime filesystem where possible.
- Explicit outbound network policy for market-data providers and backend event callbacks.
- Health checks, metrics, log labels, and tenant-aware trace correlation.

## Public/Shared Research Layer Strategy

The current `algorithms.is_public` and ranking path are useful for a prototype, but they are not sufficient for database-per-tenant isolation.

Future public sharing should use explicit publication records:

- User clicks publish from a private tenant workspace.
- Backend validates ownership and creates a sanitized immutable snapshot in the control/public database.
- Public record stores only allowed fields: display name, author handle, strategy description, selected source visibility, selected metrics, backtest summary, risk disclaimers, timestamps, and references to approved chart snapshots.
- Private raw trades, full candles, paper events, tenant database IDs, internal run IDs, credentials, and unpublished code stay tenant-private.
- Public records can be unpublished without deleting private tenant research.

Ranking and public profiles should query only the public catalog, never tenant operational tables directly.

## Security And Isolation Requirements

- Treat strategy code as untrusted even after AST validation.
- Run strategy execution in constrained worker processes or containers with timeouts, memory limits, and blocked dangerous IO.
- Remove direct tenant data access from public endpoints.
- Add backend rate limits for auth, validation, backtests, optimizer runs, paper starts, and public APIs.
- Add audit events for login, strategy publish/unpublish, tenant provisioning, billing changes, broker credential changes, and paper-trading lifecycle events.
- Store broker/API credentials encrypted with tenant-scoped keys; never send secrets to frontend after creation.
- Use least-privilege database roles: control-plane API role, tenant app role, migration role, read-only analytics role.
- Add internal authentication for engine-to-backend callbacks; `/api/paper/internal/event` should not rely only on network obscurity.
- Add log scrubbing for code, tokens, credentials, headers, and database URLs.
- Build explicit data retention and tenant deletion workflows.

## Backend Roadmap

- Introduce migration tooling and a documented schema lifecycle.
- Split database access into control-plane and tenant-plane modules.
- Replace direct `pool` usage in controllers with services/repositories that accept tenant context.
- Add tenant resolution middleware after authentication.
- Move public ranking/profile data to explicit public catalog tables.
- Convert backtest and optimizer execution into job records with status, retries, cancellation, progress, and error details.
- Add backend tests for authorization, tenant resolution, public/private visibility, and engine callback validation.
- Add request validation consistently at route boundaries using shared contracts.
- Add observability: structured logs, request IDs, tenant IDs, job IDs, metrics, and health checks.
- Add subscription-aware quota enforcement for concurrent runs, paper sessions, optimizer size, storage, and API usage.

## Frontend Roadmap

- Keep the current authenticated research workspace, but organize it around projects, strategy versions, experiments, and runs.
- Add tenant/workspace switching once organizations or subscriptions exist.
- Add explicit publish/unpublish flows with previews of exactly what becomes public.
- Improve research workflow: compare runs, filter experiments, duplicate strategies, rerun with modified parameters, annotate results, and export reports.
- Add job progress UI for backtests and optimizers instead of only polling basic status.
- Add subscription and quota UI: current tier, limits, active sessions, usage history, and upgrade prompts.
- Add public community pages that read only from public catalog APIs.
- Add empty, loading, error, and permission states across all major pages.

## Python Engine Roadmap

- Keep the current FastAPI boundary, but make all requests tenant-aware through backend-issued job/session context.
- Remove direct shared `DATABASE_URL` dependency from engine recovery; the backend or job scheduler should provide tenant-scoped recovery records.
- Harden strategy sandboxing beyond AST checks: subprocess/container isolation, wall-clock limits, memory limits, stdout/stderr limits, and deterministic error reporting.
- Make backtests reproducible by recording engine version, strategy version, config, exchange metadata, fee model, slippage model, candle source, and parameter overrides.
- Add job cancellation and heartbeat reporting.
- Separate market-data adapters, execution models, portfolio accounting, and strategy runtime behind stable interfaces.
- Expand tests for multi-symbol paper trading, short strategies, leverage/margin settings, order types, partial fills, stop/limit behavior, and recovery.
- Add performance profiling before scaling optimizer workloads.

## Database Roadmap

- Adopt a migration tool for both TypeScript and Python workflows.
- Convert `database/schema.sql` into versioned migrations.
- Add foreign keys where currently generic references are used, or document polymorphic references with compensating integrity checks.
- Avoid storing large candle arrays indefinitely in run rows; move large time-series payloads to partitioned tables or object storage with metadata references.
- Add `strategy_versions` so historical runs point to immutable code/config versions.
- Add `optimizer_runs` and parameter trial tables instead of returning optimizer results only as transient responses.
- Add indexes for common list/detail queries and future public catalog sorting.
- Add backup, restore, tenant export, tenant deletion, and tenant migration procedures.

## DevOps And Deployment Roadmap

- Expand CI to include backend typecheck, frontend lint/build, contracts build, and engine tests.
- Add backend unit/integration tests and run them in CI.
- Build Dockerfiles for backend, frontend, and engine.
- Expand local compose to run the full stack without requiring manual engine startup.
- Add environment validation documentation with safe examples only.
- Add staging and production deployment manifests after the app is containerized.
- Add managed Postgres backup policies before production tenants.
- Add secrets management, image scanning, dependency scanning, and vulnerability alerts.
- Add metrics and alerts for API errors, engine failures, paper session health, job latency, database connection pressure, and tenant provisioning failures.

## AI-Assisted Features Roadmap

- Strategy explanation: summarize strategy logic, config, risks, and expected market regime.
- Strategy linting: identify forbidden APIs, suspicious lookahead bias, unstable parameters, and missing risk controls.
- Backtest analysis assistant: explain results, drawdowns, trade clusters, and robustness concerns.
- Parameter suggestion assistant: propose bounded optimizer spaces from existing `CONFIG`.
- Research notebook assistant: generate a human-readable research report from selected runs.
- Public publishing assistant: warn when a user is about to publish code, sensitive notes, or overfit claims.
- Tenant support assistant: answer questions using only that tenant's authorized research data.

AI features must be permission-aware, should never train or retrieve across private tenants unless explicitly authorized, and should use sanitized public catalog data for community insights.

## Trading Research Features Roadmap

- Strategy versioning and immutable run provenance.
- Experiment groups and side-by-side backtest comparison.
- Walk-forward testing and out-of-sample splits.
- Monte Carlo trade resampling and drawdown simulations.
- Portfolio-level backtesting across multiple strategies and symbols.
- Robust benchmark comparison against buy-and-hold and market regimes.
- Market data cache with provenance, gaps, and vendor metadata.
- Advanced optimizer storage, ranking, and reproducibility.
- Paper trading session replay and incident timeline.
- Broker integration only after paper trading, sandboxing, and audit controls are mature.

## Subscription And Free-Tier Roadmap

- Free tier should eventually receive an isolated tenant database, but with strict quotas.
- Early MVP can use tenant-aware single deployment plus isolated databases before dedicated containers.
- Suggested limits:
  - Free: one tenant database, small storage, limited backtests per day, one active paper session, small optimizer grid.
  - Pro: more storage, more concurrent jobs, longer paper sessions, larger optimizer runs, AI reports.
  - Team: shared workspace, multiple members, role-based access, audit log, higher quotas.
  - Enterprise: dedicated runtime, custom retention, private deployment option, advanced support.
- Billing state should live only in the control plane.
- Quotas must be enforced server-side before creating jobs or paper sessions.

## Prioritized Milestones

### Phase 0: Stabilize Current App

**Objectives**

- Make the current single-tenant-per-user experience reliable and easier to change.
- Establish test, migration, and documentation foundations before tenancy work.

**Concrete Tasks**

- Add database migration tooling and convert `database/schema.sql` into the first migration.
- Add backend tests around auth, algorithm ownership, private/public visibility, backtest creation, and paper-run lifecycle.
- Add internal authentication for engine callbacks to the backend.
- Expand CI to run engine tests plus backend/frontend/contracts builds.
- Containerize backend and engine for local development.
- Document current architecture and environment setup in README files.
- Audit direct `pool` usage and group database access behind service/repository modules.

**Expected Outcome**

The current app is shippable as a stable research MVP with repeatable setup, safer engine callbacks, and a clear path to schema changes.

**Risk/Complexity**

Medium. Most work is foundational but touches core request paths.

**Dependencies**

- Existing backend, frontend, engine, and database must continue to run locally.
- No tenant architecture changes should be started until migrations are in place.

### Phase 1: Improve Research Workflow

**Objectives**

- Turn isolated runs into a coherent research workflow.
- Make backtests, optimizer results, and paper runs reproducible and comparable.

**Concrete Tasks**

- Add `strategy_versions` and link every backtest/paper/optimizer run to an immutable strategy version.
- Add `optimizer_runs` and parameter trial persistence.
- Add experiment grouping for related runs.
- Add run comparison UI for equity curves, metrics, trades, and drawdowns.
- Add richer backtest progress, cancellation, and error details.
- Add AI-assisted strategy explanation and backtest summary using tenant-scoped data only.
- Move large candle/time-series storage out of `backtest_runs` rows or define a retention policy.

**Expected Outcome**

Users can iterate on strategies systematically, compare experiments, and trust that old results remain reproducible.

**Risk/Complexity**

Medium. Requires schema changes, UI changes, and run provenance discipline.

**Dependencies**

- Phase 0 migration tooling.
- Stable contracts between frontend, backend, and engine.

### Phase 2: SaaS Tenant Architecture

**Objectives**

- Introduce Odoo-style tenant isolation with a control plane and tenant databases.
- Ensure free-tier users can be provisioned into isolated databases.

**Concrete Tasks**

- Create control-plane tables for tenants, memberships, tenant database registry, subscriptions, quotas, and audit events.
- Add tenant resolution middleware and tenant context propagation.
- Build `TenantDbProvider` and refactor backend feature services to use tenant-scoped connections.
- Create tenant database provisioning: create DB, apply migrations, create least-privilege role, register tenant.
- Move current user-owned research data into tenant databases through a one-time migration plan.
- Change engine requests to receive tenant/job/session context from backend instead of using the shared database directly.
- Add server-side quota checks for concurrent runs, optimizer size, paper sessions, and storage.

**Expected Outcome**

QuantLab can create and operate isolated tenant databases while keeping global auth, billing, and routing in the control plane.

**Risk/Complexity**

High. This changes the core data-access model and requires careful migration.

**Dependencies**

- Phase 0 migrations and tests.
- Phase 1 run provenance is strongly recommended before moving data.
- A provisioning-safe deployment environment.

### Phase 3: Public/Community Layer

**Objectives**

- Support public rankings, public profiles, and shared research without reading private tenant databases directly.
- Make publication explicit, reversible, and auditable.

**Concrete Tasks**

- Create public catalog tables in the control database.
- Replace ranking queries over tenant/private tables with public catalog APIs.
- Add publish/unpublish flows for algorithms and selected backtest summaries.
- Add sanitized snapshot generation and validation.
- Add public profile records independent of tenant databases.
- Add moderation/reporting fields and abuse controls.
- Add audit events for every publish/unpublish action.

**Expected Outcome**

Community discovery works across tenants while private tenant data remains isolated unless explicitly published.

**Risk/Complexity**

Medium to High. The data model is straightforward, but privacy mistakes are high impact.

**Dependencies**

- Phase 2 tenant identity and control plane.
- Clear product rules for what can be published.

### Phase 4: Production Hardening

**Objectives**

- Prepare the platform for real SaaS operation with reliability, observability, backups, and security controls.

**Concrete Tasks**

- Add structured logging, request IDs, tenant IDs, job IDs, metrics, and traces.
- Add alerting for API errors, engine failures, stuck jobs, paper session disconnects, and tenant provisioning failures.
- Add backup and restore procedures for control and tenant databases.
- Add tenant export/delete workflows.
- Add secrets management and encrypted broker credential storage.
- Add rate limiting, abuse prevention, and WAF/CDN protections for public endpoints.
- Add deployment manifests for staging and production.
- Add container image scanning and dependency vulnerability checks.
- Add disaster recovery runbooks.

**Expected Outcome**

QuantLab can operate production tenants with known recovery paths, observable failures, and a defensible security posture.

**Risk/Complexity**

High. Operational reliability depends on infrastructure choices and disciplined runbooks.

**Dependencies**

- Phase 2 tenant provisioning.
- Phase 3 public/private boundary.
- Deployment target selected by the project owner.

### Phase 5: Advanced Quant Platform Features

**Objectives**

- Evolve from research MVP into a serious quant platform with advanced modeling, collaboration, and scalable compute.

**Concrete Tasks**

- Add portfolio-level backtesting across multiple strategies and symbols.
- Add walk-forward testing, out-of-sample validation, Monte Carlo simulations, and regime analysis.
- Add dataset management and market-data quality reports.
- Add worker queues and distributed optimizer execution.
- Add dedicated tenant runtime containers for paid tiers.
- Add team collaboration: roles, comments, shared projects, and approval workflows.
- Add broker sandbox/live-trading integrations only after risk controls and audit trails are mature.
- Add advanced AI research reports, overfitting detection, and strategy review workflows.

**Expected Outcome**

QuantLab becomes a scalable research and paper-trading SaaS with professional-grade isolation, reproducibility, collaboration, and advanced quant tooling.

**Risk/Complexity**

Very High. These features require mature platform operations and careful product sequencing.

**Dependencies**

- Production-grade tenant architecture.
- Stable engine sandboxing.
- Mature quota, billing, and observability systems.
