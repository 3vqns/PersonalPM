# Backend

## Purpose

The backend in [backend](/Users/tervin23/Documents/AG/PersonalPM/backend) is the PictureMe system boundary. It owns API routing, Supabase JWT validation, protected runtime configuration, event and account writes, gallery access rules, async upload orchestration, matching triggers, and internal cleanup.

## Current Scope

- [backend/main.py](/Users/tervin23/Documents/AG/PersonalPM/backend/main.py): FastAPI app setup, middleware, and route mounting.
- [backend/config.py](/Users/tervin23/Documents/AG/PersonalPM/backend/config.py): Required environment validation, upload limits, and external retry/timeout settings.
- [backend/errors.py](/Users/tervin23/Documents/AG/PersonalPM/backend/errors.py): Stable JSON error contract for app, validation, and unhandled errors.
- [backend/logging.py](/Users/tervin23/Documents/AG/PersonalPM/backend/logging.py): Structured request logging with request correlation via `X-Request-ID`.
- [backend/routes](/Users/tervin23/Documents/AG/PersonalPM/backend/routes): Account, event, gallery, verification, health, runtime-config, and internal operation routes.
- [backend/services](/Users/tervin23/Documents/AG/PersonalPM/backend/services): Supabase-backed business orchestration for uploads, matching, gallery sharing, and cleanup.
- [backend/tests](/Users/tervin23/Documents/AG/PersonalPM/backend/tests): Focused backend tests for permission, async trigger, sharing, matching, and cleanup safety.

## Runtime Boundary

- Browser-safe config may be exposed through the runtime-config endpoint.
- Secrets remain backend-only and must never be forwarded wholesale to the frontend.
- Supabase remains the source of truth for auth and relational data.
- Frontend application code should call backend routes for account, dashboard, event, gallery, upload, share-token, and cleanup-adjacent behavior instead of querying `public.users`, `events`, or `event_members` directly.
- Event settings updates are allowed for event owners and admins, while deletion and admin role changes remain owner-only.
- Personal gallery shares and full event gallery shares are read-only public token routes. They must not create `event_members` rows or gallery-access rows.
- Join tokens are registration-only. A signed-in public join creates approved gallery access immediately; a signed-in private join creates a pending access request.
- Private-gallery requests create or preserve event membership with pending gallery access; approval grants gallery viewing and ensures the approved user is an event member. Public event joins create approved gallery-access rows immediately so public invite/QR registration cannot leave members with `none` access.
- Event member removal deletes the user's `event_members` row, gallery-access row, and event photo matches so the event no longer appears from membership-based dashboard queries.

## Frontend Integration Expectations

- The frontend should always provide `VITE_API_BASE_URL` outside demo mode so authenticated screens go through the backend contract.
- The frontend should forward the Supabase access token as `Authorization: Bearer <token>` and should not send service-role or internal secrets.
- Successful and failed API responses may include `X-Request-ID`; surface that in support/debug tooling when possible.
- Invite-token lookup failures include a safe token fingerprint and token length in error details, and backend logs include the same fingerprint so frontend reports can be correlated without exposing raw invite tokens.
- Multipart routes currently expected by the backend:
  - `POST /api/account/face-profile`: `selfies` or `face` fields with 3 to 5 images
  - `POST /api/events`: form fields for `name`, `date`, optional `description`
  - `POST /api/events/{event_id}/photos`: repeated `photos` image files
