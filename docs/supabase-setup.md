# Supabase auth setup

This project uses **Supabase Auth** for sign-in and **custom JWT claims** for RBAC. The Lambdas and UI do not read roles from a separate app table — they expect these **top-level** access-token claims:

| Claim         | Required for | Example                           |
| ------------- | ------------ | --------------------------------- |
| `sub`         | Everyone     | Supabase user id (automatic)      |
| `app_role`    | Everyone     | `merchant`, `partner`, or `admin` |
| `merchant_id` | Merchants    | `merchant_1`                      |
| `partner_id`  | Partners     | `partner_2`                       |

Types: `shared/auth-contract.ts` (`SupabaseJwtClaims`). Parsed in `ui/src/auth/sessionIdentity.ts` and `layers/lambda-utils/src/index.ts`.

## How it works today

```text
auth.users.raw_app_meta_data          Supabase JWT (before hook)
        │                                      │
        │  { app_role, merchant_id, ... }      │  claims.app_metadata ← copied from raw_app_meta_data
        │                                      │
        └──────────────► custom_access_token_hook (public)
                                    │
                                    ▼
                         Top-level JWT claims: app_role, merchant_id, partner_id
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           API Gateway JWT authorizer          UI sessionIdentity
           (deployed)                          (decode access_token)
                    │
                    ▼
              lambda-utils → AuthContext
```

There is **no** `user_roles` table or other auth schema in `db/migrations/`. Only:

1. Rows in `auth.users` with `raw_app_meta_data` set
2. Postgres function `public.custom_access_token_hook`
3. Hook enabled in Supabase Dashboard (Authentication → Hooks → Custom access token)

The hook implementation in this project reads **`claims.app_metadata`** (already populated by Supabase from `raw_app_meta_data`) and copies fields onto **top-level** claims. That matches what the code expects — not nested `app_metadata.app_role`.

## One-time setup

### 1. Create users (Dashboard)

In **Authentication → Users → Add user**, create three users (email + password). Use the same addresses in:

- Root `.env` (`MERCHANT_EMAIL`, `PARTNER_EMAIL`, `ADMIN_EMAIL`) for `scripts/smoke-async-retry.mjs`
- `ui/.env` demo prefill (`VITE_DEMO_*`) if you want login shortcuts

`.env.example` uses `@example.com` placeholders; your project may use another domain (e.g. `@icetique.dev`) — the emails must match between Supabase, `.env`, and the SQL below.

### 2. Install the hook and metadata (SQL)

Open **SQL Editor** and run [`supabase-setup.sql`](./supabase-setup.sql), or paste sections manually:

1. `CREATE OR REPLACE FUNCTION public.custom_access_token_hook ...`
2. Three `UPDATE auth.users SET raw_app_meta_data = ...` statements (edit emails if needed)
3. Verification `SELECT`

`merchant_id` / `partner_id` values must align with agreement data (`merchant_1`, `partner_2` in create-agreement payloads and tests).

### 3. Enable the hook (Dashboard)

**Authentication → Hooks → Custom access token**:

- Enable the hook
- Postgres function: `public.custom_access_token_hook`

(Hosted Supabase: select the function from the dropdown. Self-hosted: `pg-functions://postgres/public/custom_access_token_hook`.)

### 4. Configure env files

**Root `.env`** (migrations, smoke script):

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
DATABASE_URL=postgresql://...
MERCHANT_EMAIL=<same as Supabase user>
MERCHANT_PASSWORD=...
PARTNER_EMAIL=...
PARTNER_PASSWORD=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

**`ui/.env`**:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
# Optional demo prefill (see ui/.env.example)
VITE_DEMO_MERCHANT_EMAIL=...
VITE_DEMO_MERCHANT_PASSWORD=...
```

**Deploy** (`samconfig.toml` / parameter overrides):

- `SupabaseIssuer` = `https://<project-ref>.supabase.co/auth/v1`
- `SupabaseAudience` = `authenticated`

These must match the issuer and audience on tokens from your Supabase project (`template.yaml` → `SupabaseJwtAuthorizer`).

## Verify

1. Sign in through the UI (or Supabase password grant in the smoke script).
2. Decode the **access token** at [jwt.io](https://jwt.io).
3. Confirm top-level claims, for example:

```json
{
    "sub": "...",
    "email": "merchant_1@...",
    "app_role": "merchant",
    "merchant_id": "merchant_1"
}
```

4. Call `GET /agreements` with `Authorization: Bearer <access_token>` — merchant should see only their agreements; admin sees all.

If sign-in succeeds but the UI stays on the login screen, claims are missing or invalid — re-check `raw_app_meta_data`, hook enablement, and sign out/in so a fresh token is issued.

## Database reset (Phase 2 event-sourced schema)

The app schema is **event-sourced** (`event_store`, `agreements_read_model`, `ledger_read_model`). After upgrading from Phase 1 migrations or squashing the migration chain, reset the **application tables** on the CQRS Supabase project (Auth users and the JWT hook are unchanged).

In **SQL Editor** (destructive — only on the CQRS demo database):

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

Then from the repo root:

```bash
npm run migrate:up
```

This applies [`db/migrations/0001_event_sourced_baseline.js`](../db/migrations/0001_event_sourced_baseline.js). Integration tests (`INTEGRATION_DATABASE_URL`) and local `DATABASE_URL` must point at this reset database before running writes.

## Local SAM note

`sam local start-api --disable-authorizer` skips API Gateway JWT validation; Lambdas still parse the bearer token when `AWS_SAM_LOCAL` is set. Use the same Supabase access tokens as production — the claim shape is identical.

## Change a user's role

Update metadata, then have the user sign out and sign in again (existing tokens are not rewritten):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"app_role":"admin"}'::jsonb
where email = 'admin_1@example.com';
```

Remove stale keys when switching roles (e.g. drop `merchant_id` when demoting a merchant) so the hook does not copy obsolete values:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'merchant_id' - 'partner_id'
where email = 'admin_1@example.com';
```
