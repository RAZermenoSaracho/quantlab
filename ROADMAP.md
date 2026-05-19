# QuantLab Roadmap

## Current State Summary

QuantLab is a full-stack algorithmic trading research application with a React/Vite frontend, Express/TypeScript backend, FastAPI Python engine, shared TypeScript contracts, and PostgreSQL schema assets.

Current capabilities:

- User registration, login, OAuth support, JWT auth, profiles, and public profile pages.
- Strategy creation from pasted Python code or a GitHub file URL.
- Python strategy validation through `engine/app/validator.py` using AST checks and a restricted execution environment.
- Backtest creation from the backend through `backend/src/controllers/backtest.controller.ts`, executed by the engine `/backtests` endpoint.
- Paper trading lifecycle through backend `/api/paper` routes and engine `/paper/start`, `/paper/stop/{run_id}`, and in-memory paper sessions.
- WebSocket updates from backend to frontend through `backend/src/services/websocketManager.service.ts`.
- Performance scoring and ranking derived from `algorithms`, `backtest_runs`, `paper_runs`, `trades`, and `metrics`.
- Shared contract package in `packages/contracts` with Zod schemas used by backend and frontend.
- Basic CI for contracts, backend, and frontend TypeScript builds.

Current architecture:

- One application database defined by `database/schema.sql`.
- User isolation is implemented mostly by `user_id` filters in shared tables.
- Engine and backend both read the same `DATABASE_URL` for paper run recovery.
- Public ranking and public algorithm pages query the same tables that hold private user research.
- Docker Compose currently provisions PostgreSQL only.
- Engine runtime state is partly in memory: backtest progress and active paper sessions are process-local.

Strengths:

- Clear separation between frontend, backend, engine, and shared contracts.
- Contracts package reduces drift between API producers and consumers.
- Strategy validation exists before execution.
- Backtesting, paper trading, optimizer, exchange catalog, event handling, and performance scoring are already separate modules.
- The product already has useful research primitives: algorithms, backtests, paper runs, metrics, trades, rankings, charts, and strategy docs.

Weaknesses and missing pieces:

- No migration tool or versioned database migration workflow.
- No tenant control plane, tenant registry, tenant routing, tenant provisioning, or tenant lifecycle management.
- No hard database isolation between users; private and public data live in the same schema.
- No separate public/community data store or explicit publish pipeline.
- Ranking currently does not restrict results to public algorithms in SQL, which conflicts with the desired public sharing model.
- Engine process isolation is not sufficient for untrusted user strategies in a SaaS environment.
- In-memory run/session state limits horizontal scaling and restart behavior.
- Backend long-running jobs run through direct async workers rather than a durable queue.
- Limited automated tests outside the Python engine tests.
- No production deployment manifests, container images, secrets strategy, observability stack, or backup/restore process.

## Product Vision

QuantLab should evolve into a quantitative trading research suite and SaaS platform where each user can design, validate, backtest, optimize, paper trade, compare, and publish trading research without compromising private strategy code or tenant data.

The platform should support:

- Private research workspaces for strategy development.
- Repeatable backtests with auditable inputs, engine version, market data provenance, and result artifacts.
- Paper trading sessions that can survive restarts and scale across workers.
- A public/community layer where users explicitly publish selected summaries, strategy metadata, and result snapshots.
- Free and paid subscriptions with clear compute, storage, market data, and concurrency limits.
- Strong tenant isolation by default, even for free-tier users once the SaaS architecture is introduced.

## Architecture Vision

Target architecture:

- **Control plane database**: global system database for users, auth identities, subscriptions, tenant registry, billing state, public/community publications, audit events, and operational metadata.
- **Tenant databases**: one isolated PostgreSQL database per tenant for private algorithms, backtests, paper runs, trades, metrics, notes, credentials metadata, and tenant-specific settings.
- **Tenant runtime**: each tenant eventually gets an isolated backend/engine runtime boundary, preferably a containerized worker set with scoped environment, network policy, CPU/memory limits, and tenant-specific database credentials.
- **Shared public layer**: public pages read only from intentionally published records in the control plane or a dedicated public database, never directly from private tenant tables.
- **Market data layer**: cache and normalize market data separately from tenant-private research data so common public exchange data can be reused safely.
- **Job execution layer**: durable queue for backtests, optimizations, paper trading supervision, scoring recomputation, publication jobs, and tenant maintenance.
- **Contract-first APIs**: continue using `packages/contracts`, but formalize endpoint schemas, event schemas, and engine job schemas as stable boundaries.

## Multi-Tenant SaaS Strategy

QuantLab should move to SaaS tenancy in stages instead of rewriting the whole app at once.

1. Introduce tenant identity while still using the current shared database.
2. Add `tenant_id` to private tables and enforce tenant-aware access in backend services.
3. Create a control plane schema for tenant records, plan limits, and tenant database locations.
4. Extract database access behind a tenant-aware data layer instead of importing the global `pool` everywhere.
5. Provision new tenants into isolated databases.
6. Migrate existing shared-database tenants into per-tenant databases.
7. Route requests and jobs by tenant context.
8. Move public/community queries to the public layer.
9. Containerize tenant runtime once tenant routing and provisioning are stable.

The important design rule is that tenant context must be resolved once at the edge, carried through every service call, and used to select the correct database, queue namespace, storage namespace, and engine runtime.

## Per-User Database Strategy

Long-term target:

- One PostgreSQL database per user, team, or subscription tenant.
- Tenant database names and credentials generated by the control plane, not derived directly from usernames or emails.
- A tenant database role with least-privilege access only to that tenant database.
- A versioned migration history inside each tenant database.
- A control plane `tenants` table that stores tenant ID, owner user ID, plan, database host, database name, encrypted credential reference, migration version, status, and timestamps.

Implementation sequence:

- Add versioned migrations for the current schema.
- Split global tables from tenant-private tables.
- Keep auth users and tenant registry in the control plane.
- Move `algorithms`, `backtest_runs`, `paper_runs`, `trades`, and `metrics` into tenant databases.
- Store globally unique public IDs or publication IDs in the control plane when content is published.
- Add tenant migration tooling for create, migrate, suspend, archive, restore, and delete workflows.
- Build tenant backup and restore routines before production migration.

## Container-Per-Tenant Strategy

The container-per-tenant model should be introduced after tenant databases and job routing exist.

Target model:

- A control plane API handles auth, billing, tenant discovery, public pages, and tenant provisioning.
- Tenant API/worker containers handle private research APIs for one tenant or a small isolated tenant group during transition.
- Engine containers execute strategies with tenant-scoped credentials, CPU/memory limits, timeouts, network restrictions, and no broad database access.
- Paper trading supervisor containers can be restarted or moved without marking runs as user-stopped.

Container isolation requirements:

- Per-tenant database credentials.
- Per-tenant object storage prefix or bucket.
- No cross-tenant environment variables.
- No shared writable filesystem between tenants.
- Strategy execution in a sandboxed process or container with strict time, memory, import, filesystem, and network rules.
- Explicit internal service auth between backend, engine, and workers.

## Public/Shared Research Layer Strategy

Private tenant data must never be queried directly for public pages. Public data should be copied through a publish workflow.

Publishable entities:

- Strategy profile: name, description, tags, author display name, supported symbols/timeframes, public source code only if user chooses.
- Backtest summary: period, exchange, symbol, timeframe, initial balance, metrics, chart-ready equity summary, engine version, and created timestamp.
- Paper trading summary: sanitized run-level metrics and selected trades if explicitly published.
- Research note: public markdown/HTML sanitized before publication.

Required workflow:

- Add explicit publish/unpublish actions.
- Show a preview of exactly what will become public.
- Copy only approved fields into `public_*` tables in the control plane.
- Store source tenant ID and private entity ID internally for owner edits, but never expose private IDs as authorization tokens.
- Revoke or update public records when a user unpublishes or deletes source content.
- Make public ranking use only `public_algorithm_summaries` or equivalent public tables.

## Security and Isolation Requirements

Baseline requirements:

- Preserve the current rule that secrets are never logged, printed, committed, or returned to clients.
- Do not store exchange API secrets in plaintext. Use a managed secrets store or envelope encryption with strict access controls.
- Add request rate limits, body size limits by route, and abuse controls for auth, validation, backtests, optimizer, paper trading, and GitHub URL imports.
- Validate GitHub import URLs with allowlists and timeouts; avoid server-side request forgery through arbitrary URL fetching.
- Add internal authentication for engine-to-backend event posts.
- Add tenant authorization checks at every private route.
- Add audit events for auth changes, publication changes, tenant provisioning, credential changes, paper run lifecycle, and admin actions.
- Sanitize rendered notes and public HTML.
- Add row-level or application-level guards during the transition period before per-tenant databases are complete.
- Keep public ranking and public profiles backed by public copies only.

Engine-specific requirements:

- Strengthen AST validation with execution limits, test fixtures for forbidden behavior, and a clear supported strategy API.
- Run user strategy code in an isolated worker process or container instead of the long-lived FastAPI process.
- Restrict imports, filesystem access, network access, CPU, memory, and wall-clock runtime.
- Record engine version, strategy spec version, market data source, and execution model with every run.

## Backend Roadmap

- Replace direct `pool` imports in controllers with service/repository modules.
- Introduce request context containing `userId`, `tenantId`, plan limits, and correlation ID.
- Add a tenant resolver and tenant-aware database client.
- Add durable job queue for backtests, optimizations, paper supervision, performance recomputation, publication sync, and tenant migrations.
- Convert internal engine events to authenticated, idempotent event handling.
- Make run status transitions explicit and resilient: `PENDING`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- Add pagination, filtering, and sorting to algorithms, backtests, paper runs, trades, and public rankings.
- Add backend tests for auth, authorization, tenant scoping, public/private visibility, run lifecycle, and publication flows.
- Add OpenAPI or generated API docs from contracts once endpoint schemas stabilize.

## Frontend Roadmap

- Keep the existing app-first workflow: dashboard, algorithms, backtests, paper, ranking, profile.
- Improve research navigation around a strategy workspace: code, notes, validation, backtests, optimizer, paper runs, metrics, and publication state.
- Add run comparison views for backtests and optimizer results.
- Add saved presets for exchange, symbol, timeframe, date range, fees, and starting capital.
- Add publication preview screens that show exactly what will be public.
- Separate private workspace routes from public/community routes in UI state and copy.
- Add subscription and usage views: current plan, run limits, active paper sessions, storage, and compute usage.
- Add frontend tests for auth state, route protection, create/edit flows, public/private visibility, and publication workflows.
- Improve loading, error, retry, and empty states for long-running engine tasks.

## Python Engine Roadmap

- Define a stable strategy SDK/spec with versioned inputs, outputs, config fields, and examples.
- Move strategy execution into isolated worker processes or containers.
- Persist progress and run events through durable backend or queue events instead of process-local maps.
- Add deterministic backtest artifacts: input hash, strategy hash, market data range, engine version, fee/slippage model, and result hash.
- Expand tests around accounting, slippage, forced close behavior, multi-symbol behavior, optimizer correctness, and paper run recovery.
- Improve market data handling with normalized adapters, retries, rate-limit handling, caching, and data quality checks.
- Add cancellation and timeout support for backtests and optimizations.
- Make paper sessions restartable from persisted state, not only active database rows and in-memory recovery.
- Add support for walk-forward analysis, Monte Carlo resampling, benchmark comparison, and portfolio-level backtests.

## Database Roadmap

- Adopt a migration tool and convert `database/schema.sql` into versioned migrations.
- Add updated-at triggers or explicit shared utilities so timestamp behavior is consistent.
- Normalize large JSONB blobs where queryability matters, while keeping artifact tables for bulky run results.
- Add indexes for common list/detail queries, public rankings, run status, tenant lifecycle, and publication lookup.
- Add public/community tables separate from tenant-private tables.
- Add tenant registry, plan limits, usage counters, audit logs, and migration status tables in the control plane.
- Add data retention policies for free-tier runs, logs, market cache, and archived tenants.
- Add backup, restore, point-in-time recovery, and tenant export procedures.

## DevOps and Deployment Roadmap

- Build Docker images for backend, frontend, and engine.
- Extend Docker Compose for local backend, frontend, engine, PostgreSQL, and eventually queue/cache services.
- Add CI steps for backend typecheck, frontend lint/build, contracts build, and Python tests.
- Add container vulnerability scanning and dependency auditing.
- Add environment variable documentation with safe examples only.
- Add staging and production deployment manifests after local containers are stable.
- Add centralized logs, metrics, traces, health checks, and alerting.
- Add database migration checks and tenant migration automation to deployment flow.
- Add backup verification and disaster recovery drills before production launch.

## AI-Assisted Features Roadmap

AI features should assist research without hiding risk or making unsupported trading claims.

- Strategy prompt generator improvements based on the supported strategy SDK.
- Strategy analyzer that explains code structure, config fields, risk controls, and likely failure modes.
- Backtest result explainer that summarizes metrics, drawdowns, trade distribution, and overfitting risks.
- Parameter search assistant that proposes bounded optimizer ranges from detected `CONFIG["params"]`.
- Research notebook assistant for comparing runs and drafting private notes.
- Public summary assistant that helps users write a sanitized publication description.
- Guardrails that avoid financial advice language and clearly separate research tooling from investment recommendations.

## Trading Research Features Roadmap

- Strategy versioning and run-to-version linkage.
- Backtest comparison and portfolios of strategies.
- Walk-forward validation and out-of-sample testing.
- Parameter optimization history and heatmaps.
- Market data quality reports and missing-candle detection.
- Benchmarks such as buy-and-hold, cash, and configurable market index proxies.
- Advanced risk metrics: exposure, turnover, value at risk, expected shortfall, drawdown duration, recovery factor, and capacity estimates.
- More realistic execution models: maker/taker fees, spread, slippage, partial fills, limit/stop behavior, and liquidity constraints.
- Multi-asset and portfolio-level paper trading.
- Alerts for paper trading events and risk thresholds.

## Subscription and Free-Tier Roadmap

Plan dimensions:

- Number of strategies.
- Backtest concurrency and monthly backtest minutes.
- Optimizer concurrency and parameter grid size.
- Paper trading sessions and allowed symbols.
- Market data history depth and refresh frequency.
- Storage retention for run artifacts.
- Public publishing limits.
- Team seats and collaboration features.

Free-tier strategy:

- Free users should eventually receive isolated tenant databases, but can start on a transitional shared tenant database if controls are explicit and temporary.
- Free-tier containers can be cold-started or pooled while preserving tenant database isolation.
- Apply strict compute, storage, and rate limits.
- Retain enough public publishing ability to support community growth without exposing private data.

## Prioritized Milestones

### Phase 0: Stabilize Current App

Objectives:

- Make the existing single-database app safer, testable, and easier to evolve.
- Fix public/private visibility gaps before expanding public features.
- Establish migration, CI, and operational foundations.

Concrete tasks:

- Add a migration tool and convert `database/schema.sql` into the first migration.
- Update public ranking queries to include only explicitly public algorithms or move them behind a temporary public summary view.
- Add backend tests for algorithm ownership, private algorithm masking, ranking visibility, and run creation authorization.
- Add tests around engine validation failures and backend error propagation.
- Add internal authentication for `/api/paper/internal/event`.
- Add durable status fields and failure messages for backtests and paper runs.
- Add CI for Python engine tests in `engine/tests`.
- Document local environment variables with safe example values in README or an example file, without editing real environment files.

Expected outcome:

- The current MVP remains functionally similar but has clearer safety boundaries, repeatable database setup, and better regression coverage.

Risk/complexity level:

- Medium. Mostly incremental, but migration adoption and public visibility fixes touch important paths.

Dependencies:

- Current schema audit.
- Agreement on migration tool.
- Test database setup.

### Phase 1: Improve Research Workflow

Objectives:

- Make QuantLab a stronger single-user/private research product before SaaS isolation work.
- Improve run repeatability, comparison, and strategy iteration.

Concrete tasks:

- Add strategy versioning so each run references the exact code/config used.
- Store engine version, strategy hash, input hash, market data source, and execution model on each run.
- Add backtest comparison UI and API endpoints.
- Add optimizer history and parameter result persistence.
- Add saved run presets for exchange, symbol, timeframe, fee rate, date range, and balance.
- Add pagination and filters for algorithms, backtests, paper runs, trades, and rankings.
- Add run cancellation and timeout handling for backtests and optimizer jobs.
- Expand Python engine tests for multi-symbol, fees, slippage, forced close, and optimizer behavior.

Expected outcome:

- Researchers can iterate on strategies with auditable, comparable, reproducible results.

Risk/complexity level:

- Medium.

Dependencies:

- Phase 0 migration foundation.
- Stable contracts for run metadata and strategy versions.

### Phase 2: SaaS Tenant Architecture

Objectives:

- Introduce tenant identity, tenant routing, and isolated tenant databases.
- Prepare the system for per-user or per-subscription database isolation.

Concrete tasks:

- Create control plane tables for users, auth identities, tenants, memberships, plans, limits, and tenant database metadata.
- Add `tenantId` to request context and private service calls.
- Replace direct global `pool` usage with tenant-aware database access.
- Add tenant-aware repositories for algorithms, backtests, paper runs, trades, and metrics.
- Add tenant provisioning commands: create database, apply migrations, create scoped role, seed defaults, mark active.
- Add tenant migration tooling for existing users from shared tables to isolated databases.
- Add job routing that includes tenant ID and selects the correct tenant database.
- Add usage accounting for runs, optimizer work, paper sessions, storage, and public publications.

Expected outcome:

- New tenants can be provisioned with isolated databases, and backend code is no longer coupled to one global private data pool.

Risk/complexity level:

- High.

Dependencies:

- Phase 0 migrations.
- Repository/data-access refactor.
- Control plane schema.
- Backup and restore plan.

### Phase 3: Public/Community Layer

Objectives:

- Build a safe public research layer that never reads private tenant data directly.
- Allow users to publish selected results and strategy summaries intentionally.

Concrete tasks:

- Create public tables in the control plane for published algorithms, backtest summaries, paper summaries, authors, tags, and publication audit history.
- Add publish, update publication, and unpublish backend flows.
- Add publication preview UI.
- Move `/ranking`, public profiles, and public algorithm pages to public tables only.
- Sanitize public notes and descriptions.
- Add moderation fields and abuse-report hooks.
- Add tests proving private tenant data is invisible unless explicitly published.

Expected outcome:

- Community features can grow without weakening tenant isolation.

Risk/complexity level:

- Medium to high.

Dependencies:

- Tenant identity from Phase 2.
- Publication schema.
- Sanitization and authorization tests.

### Phase 4: Production Hardening

Objectives:

- Make the platform reliable, observable, secure, and operable in staging and production.

Concrete tasks:

- Containerize backend, frontend, and engine.
- Add queue/cache infrastructure for jobs and realtime coordination.
- Add structured logs, request IDs, metrics, traces, dashboards, and alerts.
- Add staging environment with production-like tenant provisioning.
- Add secrets management for JWT secrets, OAuth secrets, database credentials, and exchange credentials.
- Add backup, restore, and tenant export workflows.
- Add rate limiting, abuse detection, and plan enforcement.
- Add security review for strategy sandboxing, GitHub imports, public HTML, engine events, and tenant routing.
- Add load tests for backtest queues, public ranking, paper event throughput, and tenant provisioning.

Expected outcome:

- QuantLab is ready for controlled beta usage with operational visibility and recovery procedures.

Risk/complexity level:

- High.

Dependencies:

- Tenant architecture.
- Durable jobs.
- Container images.
- Secrets and observability tooling.

### Phase 5: Advanced Quant Platform Features

Objectives:

- Expand QuantLab from an MVP research app into an advanced quant research platform.

Concrete tasks:

- Add portfolio-level backtesting across multiple strategies and symbols.
- Add walk-forward testing, out-of-sample validation, Monte Carlo analysis, and robustness reports.
- Add richer optimizer outputs: heatmaps, constraints, objective functions, and parameter stability.
- Add market data cache, quality scoring, and vendor abstraction.
- Add team workspaces, sharing inside a tenant, comments, and review workflows.
- Add paper trading risk alerts and notification channels.
- Add strategy marketplace or template library based only on public/published artifacts.
- Add enterprise features: custom tenant configuration, dedicated runtime sizing, audit exports, and retention controls.

Expected outcome:

- QuantLab becomes a differentiated SaaS platform for serious quantitative research, private strategy development, and controlled public knowledge sharing.

Risk/complexity level:

- High.

Dependencies:

- Production hardening.
- Stable tenant isolation.
- Mature research workflow.
- Public/community safety model.
