# Backend

## Purpose

The backend in [backend](/Users/earmantrading23/Documents/PictureMe/backend) is the PictureMe system boundary. It owns API routing, Supabase JWT validation, protected runtime configuration, event and account writes, gallery access rules, async upload orchestration, matching triggers, and internal cleanup.

## Current Scope

- [backend/main.py](/Users/earmantrading23/Documents/PictureMe/backend/main.py): FastAPI app setup, middleware, and route mounting.
- [backend/config.py](/Users/earmantrading23/Documents/PictureMe/backend/config.py): Required environment validation, upload limits, and external retry/timeout settings.
- [backend/errors.py](/Users/earmantrading23/Documents/PictureMe/backend/errors.py): Stable JSON error contract for app, validation, and unhandled errors.
- [backend/logging.py](/Users/earmantrading23/Documents/PictureMe/backend/logging.py): Structured request logging with request correlation via `X-Request-ID`.
- [backend/routes](/Users/earmantrading23/Documents/PictureMe/backend/routes): Account, event, gallery, verification, health, runtime-config, and internal operation routes.
- [backend/services](/Users/earmantrading23/Documents/PictureMe/backend/services): Supabase-backed business orchestration for uploads, matching, gallery sharing, and cleanup.
- [backend/tests](/Users/earmantrading23/Documents/PictureMe/backend/tests): Focused backend tests for permission, async trigger, sharing, matching, and cleanup safety.

## Runtime Boundary

- Browser-safe config may be exposed through the runtime-config endpoint.
- Secrets remain backend-only and must never be forwarded wholesale to the frontend.
- Supabase remains the source of truth for auth and relational data.
- Frontend application code should call backend routes for account, dashboard, event, gallery, upload, share-token, and cleanup-adjacent behavior instead of querying `public.users`, `events`, or `event_members` directly.

## Frontend Integration Expectations

- The frontend should always provide `VITE_API_BASE_URL` outside demo mode so authenticated screens go through the backend contract.
- The frontend should forward the Supabase access token as `Authorization: Bearer <token>` and should not send service-role or internal secrets.
- Successful and failed API responses may include `X-Request-ID`; surface that in support/debug tooling when possible.
- Multipart routes currently expected by the backend:
  - `POST /api/account/face-profile`: `selfies` or `face` fields with 3 to 5 images
  - `POST /api/events`: form fields for `name`, `date`, optional `description`
  - `POST /api/events/{event_id}/photos`: repeated `photos` image files
