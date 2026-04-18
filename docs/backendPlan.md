# Backend Plan Replacement And Stage 1 Execution Plan

## Summary

Replace [docs/backendPlan.md](/Users/tervin23/Documents/AG/PictureMe/docs/backendPlan.md) with the staged backend and routing plan below. This plan assumes the Supabase database, Auth, helper SQL functions, triggers, and RLS already exist, and that the remaining work is the backend service and route orchestration layer.

Stage 1 begins with the backend foundation phase: scaffold the FastAPI service, validate environment config, standardize request and error handling, and establish auth and runtime-config boundaries for the frontend.

## Stage 1 — Backend Foundation And Request Model

### Goal

Stand up a production-shaped FastAPI backend that can safely own routing, permissions, and external-service orchestration.

### Responsibilities

- Create the backend service scaffold under [backend](/Users/tervin23/Documents/AG/PictureMe/backend)
- Validate environment variables at startup
- Add shared middleware for:
  - request parsing
  - auth extraction
  - error formatting
  - request logging
  - internal-route protection
- Add a health endpoint
- Define a consistent JSON response and error contract
- Add an allowlisted public runtime-config endpoint only if the frontend needs browser-safe values from the backend

### Locked Decisions

- Runtime: Python + FastAPI
- Auth source: Supabase JWT from the frontend session
- Data access: server-side Supabase clients
- Secrets stay backend-only
- No raw `.env` values are ever forwarded to the browser

### Core Modules

- `config`
- `main`
- `app`
- `dependencies/auth`
- `dependencies/internal`
- `errors`
- `core/supabase_admin`
- `core/supabase_user`
- `core/logger`
- `routes/health`
- `routes/runtime_config` if needed

### Exit Criteria

- Backend boots with validated config
- Protected route can identify current Supabase user
- Errors return one stable JSON shape
- Health route works locally and in deployment

## Stage 2 — Account And Face Profile Routes

### Goal

Implement account and profile state plus face-profile lifecycle through backend-owned APIs.

### Routes

- `GET /api/account`
- `PATCH /api/account/profile`
- `POST /api/account/face-profile`
- `DELETE /api/account/face-profile`

### Responsibilities

- Read and write `public.users`
- Own face-profile indexing and deletion lifecycle with Rekognition
- Trigger rematch when a face profile is added or replaced
- Clear dependent matches when a face profile is deleted

### Exit Criteria

- Account page no longer relies on frontend direct database writes
- Face profile add, update, and delete works end-to-end

## Stage 3 — Event Creation, Join, And Membership Routing

### Goal

Implement event lifecycle and permissioned membership flows described in the docs.

### Routes

- `GET /api/dashboard`
- `POST /api/events`
- `GET /api/events/:id`
- `PATCH /api/events/:id`
- `DELETE /api/events/:id`
- `GET /api/events/:id/members`
- `PATCH /api/events/:id/members/:userId`
- `GET /api/events/join/:token`
- `POST /api/events/:id/join`

### Responsibilities

- Dashboard aggregation
- Event CRUD
- Join preview for signed-out users
- Join flow for authenticated users
- Creator, admin, and member enforcement
- Rekognition collection orchestration on event creation
- Join-triggered matching kickoff

### Exit Criteria

- Dashboard, event settings, and join flow are backend-owned
- Membership changes and event permissions are enforced server-side

## Stage 4 — Gallery Read Routes And Shared Public Gallery

### Goal

Serve event gallery data and tokenized public gallery access through stable backend APIs.

### Routes

- `GET /api/events/:id/photos`
- `GET /api/events/:id/my-photos`
- `POST /api/gallery-tokens`
- `GET /api/gallery/:token`

### Responsibilities

- Return full event gallery to members
- Return matched photos to the current user
- Create or reuse share tokens scoped to one user and one event
- Expose only token-owner matched photos on the public gallery route

### Exit Criteria

- Event gallery and shared gallery pages are fully backend-driven
- Public share links do not leak full-gallery data

## Stage 5 — Photo Upload Pipeline And Admin Processing

### Goal

Implement upload orchestration for creators and admins with async indexing.

### Route

- `POST /api/events/:id/photos`

### Locked Workflow

- Request accepts multipart upload
- Backend returns immediately with `jobId`
- Cloudinary upload runs asynchronously
- Rekognition indexing runs asynchronously
- `photos` and `face_index` are written during processing
- Progress is tracked per file and per batch
- Failures are tracked per file, not only per batch

### Services

- `photoUploadService`
- `cloudinaryService`
- `rekognitionIndexService`
- `uploadJobService`

### Exit Criteria

- Admin upload works
- Photos appear in gallery after processing
- Frontend upload modal can track progress

## Stage 6 — Matching Engine And Re-Match Triggers

### Goal

Implement the product’s automatic photo matching behavior.

### Triggers

- user joins event with face profile
- admin uploads photos
- user adds or replaces face profile

### Locked Workflow

- Read the user's current enrollment selfie set from private storage
- Read event collection ID
- Search Rekognition collection with each enrollment selfie
- Map Rekognition face IDs through `face_index`
- Insert deduplicated `user_photo_matches`
- Notify frontend of updated `My Photos`

### Decisions

- Similarity threshold is backend-configurable
- Join-triggered matching may run inline for small events but must use shared `matchingService`
- Upload-triggered matching runs asynchronously
- Duplicate `(user_id, photo_id)` matches are ignored safely

### Exit Criteria

- `My Photos` populates automatically from all required triggers
- Re-matching is consistent and idempotent

## Stage 7 — Cleanup, Expiry, And Internal Operations

### Goal

Implement the documented 30-day expiry behavior.

### Route

- `POST /api/cleanup`

### Responsibilities

- internal-only execution
- find expired events
- delete Cloudinary media
- delete Rekognition collections
- clear `face_index` and `user_photo_matches`
- mark events expired
- retain lightweight event history

### Exit Criteria

- Expiry behavior matches the docs
- Cleanup is idempotent and retry-safe

## Stage 8 — Hardening, Testing, And Deployment Readiness

### Goal

Make the backend stable enough to replace the current temporary frontend fallback layer.

### Responsibilities

- structured logging
- correlation IDs
- retries for external service failures
- rate limiting
- upload guardrails
- timeouts
- deployment health and readiness
- automated tests for permissions, workflows, matching, sharing, and cleanup

### Exit Criteria

- Backend is deployable
- Core flows are test-covered
- Frontend can switch cleanly to backend-owned APIs

## Stage 1 Implementation Plan

### Files And Structure To Create

Under [backend](/Users/tervin23/Documents/AG/PictureMe/backend), create:

- `main.py`
- `app/main.py`
- `app/config.py`
- `app/errors.py`
- `app/core/logger.py`
- `app/core/supabase_admin.py`
- `app/core/supabase_user.py`
- `app/dependencies/auth.py`
- `app/dependencies/internal.py`
- `app/middleware/request_logging.py`
- `app/routes/health.py`
- `app/routes/runtime_config.py` only if needed
- `app/models/api.py`

Recommended default: Python with FastAPI and typed Pydantic models.

### Environment Contract

Stage 1 should validate these categories:

- app: port, node env, frontend origin
- Supabase: project URL, service-role key, JWT validation settings if needed
- optional public frontend config allowlist
- internal route secret or signed-token config for cleanup-style endpoints
- logging level

Do not expose:

- service-role key
- AWS secrets
- Cloudinary secrets
- any internal API secret

### Request And Auth Model

- Frontend sends Supabase bearer token on protected API calls
- `requireAuthenticatedUser` verifies token and attaches:
  - `userId`
  - `email` if available
  - raw claims if needed for tracing
- User-facing protected routes require auth dependency injection
- Internal-only routes require separate internal protection dependency

### Error Contract

Use one response shape for failures:

- `message`
- `code`
- optional `details`

This must stay stable across validation, auth, permission, and external-service failures so the frontend does not need endpoint-specific parsing rules.

### Public Runtime Config Decision

If the frontend needs backend-provided runtime config, Stage 1 should add an allowlisted route such as `GET /api/runtime-config` that returns only browser-safe values like:

- API base URL
- public app origin
- feature flags explicitly approved for browser use

It must not return arbitrary `.env` values.

## Test Plan For Stage 1

- backend starts with valid config
- backend fails fast with missing required config
- health route returns success payload
- protected test route rejects missing or invalid bearer token
- protected test route accepts valid Supabase-authenticated request
- internal-only route rejects public requests
- error middleware returns stable JSON shape
- runtime-config route, if added, exposes only allowlisted public keys

## Assumptions And Defaults

- Existing database schema and RLS are correct and out of scope for this file
- Backend runtime is Python + FastAPI
- Python dependencies are tracked in the root `requirements.txt`
- Supabase remains source of truth for auth and relational data
- Cloudinary remains media storage
- AWS Rekognition remains face indexing and matching provider
- Frontend direct-to-Supabase fallback is temporary and should be removed as backend stages land
- No secret environment variables are ever forwarded wholesale to the frontend
