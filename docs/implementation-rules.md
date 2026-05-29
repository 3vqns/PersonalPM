# Implementation Rules

## Purpose

Use these rules before merging frontend, backend, or Supabase changes. The goal is to prevent page crashes, schema drift, and deployment mismatches between the Vercel frontend, backend API, and Supabase database.

## Diagnosis Rules

- Check the browser console first for route render failures, then check backend/API responses, then check Supabase REST/Postgres logs.
- Do not assume Supabase is the cause when Supabase REST calls are returning `200`; in that case inspect the frontend runtime and API response shape.
- Compare against the last-known-good branch before changing code. For this project, `tdev` is the reference branch when the current branch regresses.
- Verify the deployed bundle or commit SHA when production behaves differently from local code.
- Keep route-level error boundaries in place for protected pages so a render failure shows a useful message instead of a blank screen.

## Supabase SQL Rules

- Write migrations to be idempotent whenever they may be rerun manually:
  - Use `CREATE TABLE IF NOT EXISTS`.
  - Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
  - Use `CREATE INDEX IF NOT EXISTS`.
  - Use `DROP POLICY IF EXISTS` before `CREATE POLICY`, or use a `DO $$` block that checks `pg_policies`.
- Use `uuid` primary keys with `gen_random_uuid()` unless the table has an existing project-specific ID strategy.
- Use `timestamptz` for timestamps that leave the database, not plain `timestamp`.
- Use `text[] not null default '{}'::text[]` for event tags unless the backend contract is explicitly changed to `jsonb`.
- Use `boolean not null default false` for feature flags such as `allow_anyone_upload`.
- Never drop, rename, or make a nullable column non-null in production without a compatibility plan, a backfill, and a frontend/backend deploy order.
- Always validate schema after migration with `information_schema.columns`, `to_regclass`, and a smoke query for the exact table/columns used by the backend.
- Any table exposed through Supabase REST must have RLS enabled and explicit policies for `anon`, `authenticated`, or service-role-only backend access.
- For `UPDATE` operations through Supabase clients, make sure the role also has a matching `SELECT` policy; otherwise updates can appear broken even when the `UPDATE` policy exists.
- Never expose the Supabase service role key in frontend code or `VITE_*` variables.

## API Contract Rules

- Backend Pydantic response models are the source of truth for frontend TypeScript types.
- Every backend response field added, renamed, or removed must update the matching frontend type in the same change.
- Database columns use `snake_case`; API and frontend fields use `camelCase`. Convert at the backend boundary.
- Do not render a frontend field unless the backend response model includes it. Database-only fields such as `expires_at` should not be used directly in React.
- Keep noncritical frontend fields optional or provide fallbacks during one deployment cycle, because frontend and backend deployments can temporarily be out of sync.
- Add or update API contract tests whenever a response model changes.

## Frontend Rules

- Every protected route must handle loading, request failure, empty data, and render failure states.
- Never initialize a signed-in browser session as visibly signed out. Hydrate from Supabase's persisted auth session when it is not expired, validate in the background, and keep the current session visible unless Supabase emits an explicit `SIGNED_OUT` event.
- Public navigation and home routes must treat `loading && !session` as an unknown auth state, not as a signed-out state. Do not show login/signup CTAs or landing-page redirects until auth resolution finishes.
- Any JSX component used by a route must be explicitly imported in that route file.
- Route tests must cover special query-state branches such as `?created=1`, `?denied=1`, and public join/gallery paths.
- Keep utility pages focused on the workflow; do not add landing-page composition to dashboard, event, or settings screens.
- Avoid nested cards inside cards unless the inner card is a repeated item, modal, or framed tool.
- Keep component props aligned with current behavior. If share UI moves from inline panels to a modal, update tests at the same time.

## Deployment Rules

- Run `npm run build` in `frontend` before merging frontend changes.
- Run targeted Vitest route tests for changed pages before merging.
- Run backend API contract tests when backend schemas or service response payloads change.
- If production is broken and Vercel team access is unavailable, prepare a code fix and document the required redeploy instead of relying on manual Vercel actions.
- After a Supabase migration, verify the live project with read-only smoke queries before declaring the task complete.
