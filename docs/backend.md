# Backend

## Purpose

The backend in [backend](/Users/tervin23/Documents/AG/PersonalPM/backend) is the PictureMe system boundary. It owns API routing, Supabase JWT validation, protected runtime configuration, event and account writes, gallery access rules, async upload orchestration, matching triggers, and internal cleanup.

## Current Scope

- [backend/main.py](/Users/tervin23/Documents/AG/PersonalPM/backend/main.py): FastAPI app setup, middleware, and route mounting.
- [backend/config.py](/Users/tervin23/Documents/AG/PersonalPM/backend/config.py): Required environment validation, upload limits, and external retry/timeout settings.
- [backend/errors.py](/Users/tervin23/Documents/AG/PersonalPM/backend/errors.py): Stable JSON error contract for app, validation, and unhandled errors.
- [backend/app_logging.py](/Users/tervin23/Documents/AG/PersonalPM/backend/app_logging.py): Structured request logging with request correlation via `X-Request-ID`, capability-path redaction, and a fixed fallback for unmatched routes.
- [backend/request_limits.py](/Users/tervin23/Documents/AG/PersonalPM/backend/request_limits.py): Early ASGI body caps for multipart upload routes.
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
- Join tokens register new signed-in attendees; a removed member needs organizer restoration before the old token can work again.
- The ID-based join and gallery-access compatibility routes can report existing membership but cannot create it. Removed members require creator restoration; a service-role-only tombstone records removals.
- A token-bound database function makes new membership decisions. Creator-only gallery grants and role changes, plus manager removals, lock the event and recheck authority in the same transaction as their writes.
- The security migration revokes browser writes on users, enrollment metadata, events, photos, matches, face indexes, and gallery access; their allowed browser reads still depend on effective RLS policies.
- Direct Cloudinary browser upload tokens and index submissions return `410`; event photos pass through the bounded multipart endpoint. The ASGI request-body limiter runs before multipart parsing, and ZIP entry count and declared aggregate expansion are checked before opening members.
- Enrollment selfies are written to a private Supabase Storage bucket by the backend. Matching loads only a user's own private path or a verified legacy Cloudinary URL. Provider asset IDs are retained in `media_cleanup_queue` until each delete is confirmed; internal cleanup retries queued work.
- Event deletion and expiry cleanup page through photo asset references before clearing database rows, so Supabase REST's row limit cannot hide later photos. An unknown legacy cover reference stops replacement or cleanup for provider review.
- `DELETE /api/account` checks that every owned event has an active admin, removes enrollment and avatar assets, transfers each owned event to its longest-serving active admin in one database transaction, anonymizes retained event-photo attribution, then deletes the Supabase Auth user. An event without an eligible admin returns `ACCOUNT_EVENT_TRANSFER_UNAVAILABLE` (409). The transfer also updates the collection reservation owner; a failed Auth deletion can leave a transferred event with the original account still present, and retrying deletion is safe.
- Event collection reservations are recorded in Supabase before AWS collection creation. Matching has configurable member/event fanout caps and a per-process concurrency cap.
- Event creation distinguishes a full collection budget from a Supabase reservation failure. AWS collection creation and stale-reservation inspection failures expose only the provider error code. A failed creation releases its reservation when AWS confirms the collection is absent. On a full budget, the backend checks up to ten reservations older than 15 minutes with no event; it releases only collections AWS confirms absent, then retries admission once. Uncertain AWS state retains its reservation for provider reconciliation. The backend AWS identity needs `rekognition:DescribeCollection` in the same region as `CreateCollection`.
- Private-gallery behavior is disabled for now. `event_gallery_access` may still exist in the schema for future work, but current gallery viewing is controlled by `event_members`, not `event_gallery_access`.
- Event member removal deletes the user's `event_members` row, gallery-access row, and event photo matches so the event no longer appears from membership-based dashboard queries.

## Frontend Integration Expectations

- The frontend should always provide `VITE_API_BASE_URL` outside demo mode so authenticated screens go through the backend contract.
- The frontend should forward the Supabase access token as `Authorization: Bearer <token>` and should not send service-role or internal secrets.
- Successful and failed API responses may include `X-Request-ID`; surface that in support/debug tooling when possible.
- Invite-token lookup failures include a safe token fingerprint and token length in error details, and backend logs include the same fingerprint so frontend reports can be correlated without exposing raw invite tokens.
- Multipart routes currently expected by the backend:
	- `POST /api/account/face-profile`: `selfies` or `face` fields with 3 to 5 images
	- `POST /api/events`: form fields for `name`, `date`, optional `description`
	- `PATCH /api/events/{event_id}`: JSON for metadata-only updates, or multipart form fields plus optional `cover` for thumbnail replacement
	- `POST /api/events/{event_id}/photos`: repeated `photos` image files
