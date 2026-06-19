# serverless-state-machine-cqrs

CQRS and event-sourced agreement settlement workflow built with AWS SAM, Lambda, API Gateway, PostgreSQL, Supabase Auth, and a Vite UI.

> **Upstream reference:** [serverless-state-machine](https://github.com/icetique/serverless-state-machine) — CRUD + transactional outbox + deployed demo.  
> **This repo:** event-sourced writes (`event_store` as source of truth), synchronous read-model projections, and explicit command/query separation.

## What it does

- Creates agreements between a merchant and a partner
- Enforces the state machine: `CREATED -> APPROVED -> FUNDED -> SETTLED`
- Appends domain events to `event_store` (one stream per agreement `public_id`)
- Projects `agreements_read_model` and `ledger_read_model` inside the same command transaction
- Persists integration events to `outbox_events` and dispatches them asynchronously
- Settles funded agreements via **EventBridge → SQS → Lambda** (not synchronous HTTP)
- Uses idempotency keys to make command retries safe
- Shares JWT auth and RBAC helpers through a dedicated Lambda layer
- Exposes a local UI for workflow execution, Supabase-backed sign-in, event store inspection, and ledger visibility
- Includes a `SettlementProcessorFunction` that consumes settlement work from SQS-shaped input

## Demo workflow

If you are new to this repo, start here. The app models a **merchant ↔ partner agreement** that moves through four statuses. Settlement after funding is **asynchronous** (not instant in the HTTP response).

| Role         | Who               | What they do in the UI                                    |
| ------------ | ----------------- | --------------------------------------------------------- |
| **merchant** | e.g. `merchant_1` | Create agreements; fund after partner approval            |
| **partner**  | e.g. `partner_2`  | Approve agreements for their `partner_id`                 |
| **admin**    | —                 | No workflow buttons — inspect event store and ledger only |

**Happy path**

1. Complete [Supabase setup](docs/supabase-setup.md) and [local stack setup](#local-setup) (or use a deployed API + hosted UI).
2. Sign in as **merchant** → create an agreement. Enter amount in **minor units** (e.g. `1000` = $10.00).
3. Sign out → sign in as **partner** → **Approve**.
4. Sign in as **merchant** again → **Fund**.
5. Wait a few seconds. The UI polls until status is **SETTLED** (outbox → EventBridge → SQS → settlement Lambda).
6. Optional: sign in as **admin** to view the event store and ledger.

State-changing API calls need an `Idempotency-Key` header (the UI generates one per form submit). Reusing the same key safely returns the original outcome.

## Repository layout

```text
serverless-state-machine-cqrs/
├── apps/
│   └── ui/                         # Vite/React frontend (role-scoped workflow UI)
├── functions/
│   ├── create-agreement/           # POST /agreements
│   ├── transition-agreement/       # approve / fund / settle HTTP + async workers
│   │   ├── handlers/http/          # API Gateway entry (app.ts)
│   │   ├── handlers/settlement/    # SQS settlement processor
│   │   ├── handlers/outbox/        # scheduled outbox dispatcher
│   │   └── src/                    # shared domain code (repository, settlement, outbox)
│   ├── list-agreements/            # GET /agreements
│   ├── list-ledger/                # GET /ledger
│   └── debug-events/               # GET /debug/events
├── packages/
│   ├── domain/                     # Commands, queries, state machine (pure TypeScript)
│   ├── db-ports/                   # DB port types (TransactionPool, Queryable)
│   └── persistence/                # PostgresAgreementCommandRepository (write side)
├── layers/lambda-utils/            # Lambda layer: auth helpers + domain/persistence runtime packages
├── shared/                         # Compile-time auth contract for the UI only
├── tests/fixtures/http-api/        # Shared Lambda test fixtures (API Gateway events)
├── db/migrations/                  # Event-sourced Postgres schema (event_store + read models)
├── docs/                           # Supabase setup, AWS migration notes
├── events/                         # SAM invoke fixtures (e.g. SQS settlement event)
├── scripts/                        # smoke tests and local layer checks
└── template.yaml                   # SAM infrastructure
```

**Boundaries worth knowing:**

- **`shared/`** holds `AuthContext` and JWT wire types for the UI. Lambdas cannot import it at runtime; they use **`layers/lambda-utils`** instead (same domain types, duplicated on purpose for packaging).
- **`tests/fixtures/http-api/`** is for Lambda unit tests (mock API Gateway events). **`apps/ui/src/test-support/`** is for React/Vitest fixtures — different jobs, different folders.
- Root **`npm test`** / **`npm run typecheck`** orchestrate all packages via `cd` chains; there is no npm workspaces setup (each package has its own `package-lock.json`).

## Scope and intentional tradeoffs

This repo is a **working demo** of agreement workflow, outbox delivery, and async settlement — not a production product template. A few items are deliberately left as-is:

| Area                 | Choice                                                   | Why                                                                                                                                            |
| -------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI**               | No GitHub Actions                                        | Quality gate is manual: `npm run verify` (or `npm test`, `npm run typecheck`, `npm run validate:template`, `sam build`) before demo or deploy. |
| **Monorepo tooling** | No npm workspaces                                        | Keeps SAM `CodeUri` paths and per-Lambda packages straightforward; root scripts chain `cd` into each package.                                  |
| **IaC routing**      | OpenAPI `DefinitionBody` plus explicit `Events: HttpApi` | SAM bug workaround so JWT authorizer routes deploy correctly — see comment block in `template.yaml`.                                           |
| **Outbox dispatch**  | At-least-once to EventBridge                             | Publish and `markPublished` cannot share a Postgres transaction with `PutEvents`; settlement is idempotent downstream.                         |
| **Auth types**       | `shared/` (UI) vs `layers/lambda-utils` (Lambda)         | Same domain `AuthContext`, duplicated because the layer cannot import UI compile-time packages at runtime.                                     |
| **UI polish**        | Global CSS; limited a11y                                 | Cohesive demo UI; not targeting WCAG compliance or design-system scoping.                                                                      |

## Main components

- `functions/create-agreement/`
    - `POST /agreements`
- `functions/transition-agreement/`
    - `POST /agreements/{agreementId}/approve`
    - `POST /agreements/{agreementId}/fund`
    - `POST /agreements/{agreementId}/settle`
    - `SettlementProcessorFunction` for SQS/EventBridge-driven settlement execution
    - `OutboxDispatcherFunction` for durable event delivery
- `functions/list-agreements/`
    - `GET /agreements`
- `functions/debug-events/`
    - `GET /debug/events`
- `functions/list-ledger/`
    - `GET /ledger`
- `apps/ui/`
    - Vite/React frontend for role-scoped workflow operation
- `db/migrations/`
    - `event_store`, `agreements_read_model`, `ledger_read_model`, idempotency, outbox
- `layers/lambda-utils/`
    - shared auth helpers and HTTP utilities mounted into API Lambdas as a Lambda layer
    - compiled `@serverless-state-machine-cqrs/domain` and `@serverless-state-machine-cqrs/persistence` packages for SAM runtime

## Command vs query boundaries

Commands append to `event_store` and update read models in one transaction. Queries read projections or the event log only.

| Side         | Lambdas                                                        | Imports                                                                                               | Database access                                                                                                                                                         |
| ------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Commands** | `create-agreement`, `transition-agreement` (HTTP + settlement) | `@serverless-state-machine-cqrs/domain`, `@serverless-state-machine-cqrs/persistence`, layer DB types | `PostgresAgreementCommandRepository` — replay stream, authorize (RBAC), `decide`, append events, project `agreements_read_model` / `ledger_read_model`, `outbox_events` |
| **Queries**  | `list-agreements`, `list-ledger`, `debug-events`               | `@serverless-state-machine-cqrs/domain` query DTOs + function-local read repositories                 | `SELECT` from read models (`list-*`) or `event_store` (`debug-events`) — no command repository imports                                                                  |

**Command-side replay:** before transitions, `PostgresAgreementCommandRepository` replays `event_store` inside the write transaction (advisory lock + `FOR UPDATE`), then runs `authorizeTransition` (RBAC only) and `decide` (lifecycle). List and ledger queries stay on projections.

**Money:** agreement `amount` values are **minor currency units** (e.g. USD cents). `1000` means $10.00. The API rejects non-integer amounts; the UI displays formatted currency.

**Transition HTTP codes:** `403` — caller not allowed (wrong role or wrong merchant/partner). `409` — action invalid for current status (e.g. double-approve race). `200` with same body — idempotency replay.

**Concurrency:** writers on the same agreement stream take a Postgres advisory transaction lock, then `SELECT … FOR UPDATE` on existing events. Empty streams need the advisory lock because `FOR UPDATE` locks no rows.

### Sync projections (why not async?)

Read models (`agreements_read_model`, `ledger_read_model`) are updated **synchronously** in the same Postgres transaction as each `event_store` append. After approve or fund returns, `GET /agreements` immediately reflects the new status (strong read-your-writes).

This repo does **not** use an async read-model projector or `projection_checkpoints`. That is intentional for this demo.

|               | Sync projections (this repo)  | Async projections (not implemented)    |
| ------------- | ----------------------------- | -------------------------------------- |
| Consistency   | Strong on list/ledger queries | Eventual — queries lag behind writes   |
| Command path  | Append + project in one tx    | Append only; projector catches up      |
| Best at scale | Low volume, few projections   | Many heavy read models, high write TPS |
| Recovery      | `npm run projections:rebuild` | Checkpoints + full rebuild             |

**Async we already have:** settlement **posting** runs asynchronously via outbox → EventBridge → SQS (see [Async settlement](#async-settlement-sqs)). That is integration async — like clearing trailing capture — not the same as async read-model projections.

**Why sync here:** ~4 events per agreement, two simple projections, demo needs immediate workflow status, simpler local and e2e tests. At scale, async projections decouple durable writes from read-model work so commands stay thin and many projections scale independently — a pattern large settlement platforms use, but unnecessary complexity for this codebase.

Read models are **disposable**: `npm run projections:rebuild` truncates them and replays from `event_store`. See [docs/architecture.md](docs/architecture.md) for diagrams and interview framing.

**Rebuild operations:** `projections:rebuild` uses `TRUNCATE` on `agreements_read_model` and `ledger_read_model`. `event_store` is not modified. Do **not** run against a database receiving live command traffic — list/ledger queries will be empty or stale until replay completes. Use a maintenance window, a restored clone, or a throwaway Supabase project. The script prompts for confirmation before running.

**Domain package** (`packages/domain/`) holds aggregate replay (`fromEvents`, `decide`), command payloads, query read models, event constants, and the state machine (`validateTransition`, `authorizeTransition`, `canRunAction`). The UI imports the same rules via the `@cqrs/domain` Vite alias (`permissions.ts`, `types.ts`).

**Persistence package** (`packages/persistence/`) implements the event-sourced `PostgresAgreementCommandRepository`. It is built into the Lambda layer alongside `lambda-utils` (`npm run build:layer`).

**Import rule:** if a file lives under a query Lambda, it must not import `@serverless-state-machine-cqrs/persistence`. Command Lambdas must not embed SQL for read models. Root `npm test` runs `scripts/check-query-boundaries.mjs` and `scripts/check-no-crud-writes.mjs` to enforce this.

### vs upstream (CRUD demo)

| Concern             | Upstream `serverless-state-machine` | This repo                                      |
| ------------------- | ----------------------------------- | ---------------------------------------------- |
| Source of truth     | Mutable `agreements.status`         | Append-only `event_store` per agreement stream |
| History             | `agreement_events` audit dual-write | Canonical events in `event_store`              |
| List / ledger reads | `agreements`, `ledger_entries`      | `agreements_read_model`, `ledger_read_model`   |
| Write path          | `UPDATE agreements` + audit insert  | Replay + `decide` + append + sync projections  |
| Concurrency         | Row lock + expected status          | Stream advisory lock + `FOR UPDATE` on events  |

### Approve, fund, and settle as separate Lambdas

`template.yaml` defines three HTTP transition functions (`ApproveAgreementFunction`, `FundAgreementFunction`, `SettleAgreementFunction`) that share one handler package but receive different env vars (`TRANSITION_EVENT_TYPE`). This is intentional:

- **Independent deploy and scaling** — approve/fund/settle can be tuned separately (memory, concurrency, alarms).
- **Least-privilege IAM** — each route maps to one Lambda; no runtime action dispatch table in a single fat handler.
- **SAM/IaC clarity** — one API route per function matches the OpenAPI surface.

Domain rules stay centralized in `packages/domain` (`authorizeTransition`, `validateTransition`, `decide`). Each transition Lambda sets `TRANSITION_EVENT_TYPE` only; the repository replays the stream under lock, authorizes, then calls `decide`.

## Async settlement (SQS)

After `POST /agreements/{id}/fund`, settlement is **not** done in the HTTP response. The default path is async:

```text
create / approve / fund (HTTP Lambda)
        │
        ▼
  event_store + read models + outbox     (same Postgres transaction)
        │
        ▼
  OutboxDispatcherFunction                 (scheduled; publishes pending rows)
        │
        ▼
  EventBridge  (AgreementFunded)
        │
        ▼
  settlement-queue (SQS, name: `{StackName}-settlement-queue`)   (DLQ: `{StackName}-settlement-dlq` after 3 receives)
        │
        ▼
  SettlementProcessorFunction            (SQS trigger; appends Settled + ledger projection)
```

Settlement assigns a `transactionId` (e.g. `txn_<uuid>`) recorded in `ledger_read_model`.

Infrastructure is defined in `template.yaml`: `SettlementQueue`, `FundedEventRule`, `SettlementProcessorFunction`, and `OutboxDispatcherFunction`.

- **Deployed:** fund returns once `agreements_read_model` shows `FUNDED`; the UI polls until `SETTLED` (~outbox dispatch interval + SQS/Lambda latency).
- **Local API (`sam local start-api`):** HTTP workflow works, but SQS is not wired automatically — use `sam local invoke OutboxDispatcherFunction` and `SettlementProcessorFunction` (or `npm run smoke:async-retry`) to exercise the async path.
- **Manual settle:** `POST /agreements/{id}/settle` exists but is off by default (`ENABLE_MANUAL_SETTLEMENT_TRIGGER=false`).

**SQS trust boundary:** only the settlement processor Lambda should consume `{StackName}-settlement-queue`. In production you would restrict `SendMessage` to EventBridge/outbox paths and treat queue payloads as internal commands (the processor still replays the aggregate before settling).

See [Settlement execution modes](#settlement-execution-modes) for invoke commands and the retry smoke script.

Queue names are scoped to the CloudFormation stack (`{StackName}-settlement-queue` / `{StackName}-settlement-dlq`). If you previously deployed with global queue names, see [docs/aws-settlement-queue-migration.md](docs/aws-settlement-queue-migration.md).

## Local setup

Prerequisites:

- Docker
- Node.js
- SAM CLI

Use a **dedicated** Supabase project for this repo — not the upstream `payments-example` database (see [docs/supabase-setup.md](docs/supabase-setup.md)).

Run migrations (loads `DATABASE_URL` from `.env` automatically). On a **new** project, run this once after [Supabase setup](docs/supabase-setup.md) steps 1–5 (including **RS256** JWT keys in step 3b):

```bash
cp .env.example .env   # first time only
npm run migrate:up
```

Start the local API:

```bash
cp samconfig.example.toml samconfig.toml
# edit samconfig.toml and replace DatabaseUrl before continuing
sam build
sam local start-api --env-vars .env.json --skip-pull-image --disable-authorizer
```

`--disable-authorizer` is required because SAM local does not support API Gateway HTTP API JWT
authorizers. The deployed API validates JWTs at the edge via `SupabaseJwtAuthorizer` in the OpenAPI
`DefinitionBody`; locally, the shared `lambda-utils` layer parses the `Authorization: Bearer`
header instead when `AWS_SAM_LOCAL` is set (SAM sets this automatically). Sign in through the UI as
usual — auth still works, it just happens inside Lambda rather than at API Gateway.

`samconfig.toml` is intentionally local-only. The repo ships `samconfig.example.toml` as the template for deploy and local SAM settings.

Start the UI:

```bash
cd apps/ui
npm run dev
```

For local UI, leave `VITE_API_BASE_URL` unset in `apps/ui/.env` (the app uses `/api`; Vite proxies that
to `http://127.0.0.1:3000`). Do not point the browser directly at SAM — cross-origin CORS preflight
fails with the OpenAPI `DefinitionBody` template. Restart `npm run dev` after changing `vite.config.ts`.

## Deploy (AWS)

After Supabase setup, `npm run migrate:up`, and a passing `npm run verify`:

```bash
sam build
cp samconfig.example.toml samconfig.toml   # first time — set DatabaseUrl, SupabaseIssuer, FrontendOrigin, EventPublisherMode=eventbridge
sam deploy
```

Host the UI separately (e.g. Vercel). In `apps/ui/.env`, set `VITE_API_BASE_URL` to the API Gateway URL from the stack output. Keep using the same Supabase project for sign-in.

## Auth

See **[docs/supabase-setup.md](docs/supabase-setup.md)** for creating demo users, `raw_app_meta_data`, the `custom_access_token_hook` SQL, **RS256 JWT signing keys**, and JWT verification.

- The frontend signs in with Supabase Auth and sends `Authorization: Bearer <access_token>`
- **Deployed:** API Gateway HTTP API validates the JWT before invoking Lambda (`SupabaseJwtAuthorizer`). Supabase must issue **RS256** tokens — ES256 returns `401` at the edge (see [JWT signing keys](docs/supabase-setup.md#3b-jwt-signing-keys-rs256)).
- **Local (`sam local start-api`):** use `--disable-authorizer`; Lambdas parse the bearer token in the
  shared layer when `AWS_SAM_LOCAL` is set (signature verification is skipped locally — acceptable
  for dev because you control the token source via Supabase sign-in)
- Lambdas map trusted claims into `AuthContext`
- The HTTP-facing Lambdas consume a shared `lambda-utils` layer instead of duplicating JWT parsing logic per function
- Required claims:
    - `sub`
    - `app_role`
- Conditional claims:
    - `merchant_id`
    - `partner_id`

The local UI uses the same Supabase-backed login flow as the deployed app. Configure in `apps/ui/.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL` — **production only** (API Gateway URL on Vercel); omit locally

Lambdas and migrations use `DATABASE_URL` in root `.env` and `.env.json` (copy from `.env.example` / `.env.json.example`).

## Settlement execution modes

Commands and fixtures for the [async SQS path](#async-settlement-sqs) above:

- Manual `POST /agreements/{id}/settle` is disabled by default (local and deployed). Settlement runs via outbox → EventBridge → SQS → `SettlementProcessorFunction`. Set `ENABLE_MANUAL_SETTLEMENT_TRIGGER=true` only if you need a synchronous settle shortcut for debugging.
- `SettlementProcessor` and `SettlementProcessorFunction` execute the settlement path used by the `EventBridge -> SQS -> Lambda` flow
- Domain events are written to `outbox_events` inside the same database transaction and dispatched asynchronously by `OutboxDispatcherFunction`
- A local SQS-shaped fixture is available at `events/settlement-sqs-event.json`

Invoke the async-ready settlement handler locally:

```bash
sam local invoke SettlementProcessorFunction --env-vars .env.json --event events/settlement-sqs-event.json
```

Dispatch pending outbox events locally:

```bash
sam local invoke OutboxDispatcherFunction --env-vars .env.json
```

Run the async retry smoke script with Supabase credentials:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
MERCHANT_PASSWORD=...
PARTNER_PASSWORD=...
ADMIN_PASSWORD=...
node scripts/smoke-async-retry.mjs
```

## Testing

### Local verify (no database required)

```bash
npm run verify
```

Runs Prettier, `sam validate --lint`, TypeScript, ESLint (`lint:check`), `check:no-crud-writes`, and unit tests (including `check:query-boundaries`).

`npm run verify:full` runs `verify` then prompts for Postgres integration tests (see below).

### Postgres integration tests

**Not safe on production.** Tests call the real command repository and **append** to `event_store`, read models, outbox rows, and idempotency keys. Rows are **not** deleted afterward (IDs like `agr_int_*`, `agr_idem_*`, `agr_race_*`). Coverage includes happy path, idempotency replay/conflict, and concurrent create/approve on the same agreement.

Requires a database migrated with `npm run migrate:up` (see [docs/supabase-setup.md](docs/supabase-setup.md)).

1. Set `INTEGRATION_DATABASE_URL` in `.env` to a **dedicated non-production** database (local Postgres or a throwaway Supabase project).
2. Do **not** point this at `DATABASE_URL` for a production or shared demo DB unless you accept test junk in that database.
3. Run:

```bash
npm run test:integration
```

The script prints the target host/database and asks you to type `yes` before running. For non-interactive use (only when you are sure):

```bash
INTEGRATION_TESTS_CONFIRM=yes npm run test:integration
```

`npm test` and `npm run verify` never touch Postgres.

Run all Lambda unit tests (compile + unit) from the project root:

```bash
npm test
```

Run all tests with coverage (Lambda packages + UI):

```bash
npm run test:coverage
```

UI unit tests (Vitest + Testing Library):

```bash
cd apps/ui && npm test
cd apps/ui && npm run test:coverage
cd apps/ui && npm run typecheck:test
```

Optional browser smoke (requires local SAM + Vite + Supabase demo users — see [docs/supabase-setup.md](docs/supabase-setup.md)):

```bash
# Terminal 1: sam local start-api …
# Terminal 2: cd apps/ui && npm run dev
cd apps/ui && npm run test:e2e
```

Per-package tests (also available from the root):

```bash
cd functions/create-agreement && npm test
cd functions/transition-agreement && npm test
cd functions/list-agreements && npm test
cd functions/debug-events && npm test
cd functions/list-ledger && npm test
```

UI build:

```bash
cd apps/ui && npm run build
```

## Available commands

| Command                         | Description                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                | Local pre-push gate: Prettier, SAM/cfn-lint, typecheck, ESLint, no-CRUD check, unit tests + query boundaries                     |
| `npm run verify:full`           | `verify` then interactive Postgres integration tests (`INTEGRATION_DATABASE_URL`)                                                |
| `npm test`                      | Run all Lambda package and UI unit tests (no Postgres)                                                                           |
| `npm run test:integration`      | Postgres integration tests — **writes rows**; prompts for confirmation; not for production                                       |
| `npm run test:coverage`         | Run Lambda + UI tests with coverage                                                                                              |
| `npm run test:e2e`              | Playwright e2e (manual; needs local stack + `VITE_DEMO_*`)                                                                       |
| `npm run typecheck`             | Type-check all Lambda packages and the UI                                                                                        |
| `npm run lint`                  | ESLint all Lambda packages and UI (auto-fix)                                                                                     |
| `npm run lint:check`            | ESLint without writing fixes (included in `verify`)                                                                              |
| `npm run validate:template`     | Lint `template.yaml` via `sam validate --lint` (uses bundled cfn-lint; see `.cfnlintrc.yaml`)                                    |
| `npm run format`                | Format all files with Prettier                                                                                                   |
| `npm run format:check`          | Check formatting without writing                                                                                                 |
| `npm run build:layer`           | Compile the shared Lambda layer                                                                                                  |
| `npm run migrate:up`            | Apply pending database migrations                                                                                                |
| `npm run migrate:down`          | Roll back the last migration                                                                                                     |
| `npm run migrate:create`        | Scaffold a new migration file                                                                                                    |
| `npm run projections:rebuild`   | Truncate read models and replay from `event_store` (requires `DATABASE_URL`; prompts for confirmation; **not for live traffic**) |
| `npm run smoke:async-retry`     | Run the end-to-end async retry smoke test                                                                                        |
| `cd apps/ui && npm run dev`     | Start the Vite dev server                                                                                                        |
| `cd apps/ui && npm run build`   | Build the UI for production                                                                                                      |
| `cd apps/ui && npm run preview` | Preview the production build locally                                                                                             |
