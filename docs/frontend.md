# Frontend

## Purpose

The frontend in [frontend](/Users/tervin23/Documents/AG/PersonalPM/frontend) is the browser application for PictureMe. It keeps Supabase browser auth for login/session handling while product data flows through the FastAPI API.

## Key Files

- [frontend/src/lib/supabase.ts](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/lib/supabase.ts): Initializes the Supabase browser auth client from Vite environment variables.
- [frontend/src/lib/authSession.ts](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/lib/authSession.ts): Reads Supabase's persisted browser session, avoids repeated `getSession()` calls for healthy tokens, and falls back to cached valid credentials if a session check times out.
- [frontend/src/providers/AuthProvider.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/providers/AuthProvider.tsx): Tracks the current session, hydrates the visible user from a cached Supabase session on refresh, and enriches account state through `GET /api/account`.
- [frontend/src/lib/api.ts](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/lib/api.ts): Central request layer. It attaches the current Supabase access token and sends non-demo product traffic to the backend API through `VITE_API_BASE_URL`.
- [frontend/src/pages](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/pages): Route-level UI for signup, login, dashboard, event gallery, event settings, join flow, and account settings.
- [frontend/src/components](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/components): Reusable UI building blocks such as navigation, upload modal, photo grids, and route guards.

## Remaining Backend Integration Cleanup

- Keep Supabase Auth in the browser for login/session handling.
- Keep refresh behavior steady: cached non-expired sessions should remain visible while backend account state refreshes.
- Set `VITE_API_BASE_URL` in every non-demo environment so authenticated product flows always hit the backend.
- Keep `GET /api/account` as the source for enriched user/profile state after the initial cached session render.
- Treat the backend as the source of truth for:
  - dashboard aggregates
  - account/profile state
  - face-profile lifecycle
  - event create/read/update/delete
  - event membership management
  - gallery reads and share tokens
  - admin photo uploads
  - async matching and cleanup side effects
