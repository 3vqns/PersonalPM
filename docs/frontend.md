# Frontend

## Purpose

The frontend in [frontend](/Users/earmantrading23/Documents/PictureMe/frontend) is the browser application for PictureMe. It should keep Supabase browser auth, but backend-owned product data flows are now implemented and should move through the FastAPI API instead of direct Supabase table access.

## Key Files

- [frontend/src/lib/supabase.ts](/Users/earmantrading23/Documents/PictureMe/frontend/src/lib/supabase.ts): Initializes the Supabase browser auth client from Vite environment variables.
- [frontend/src/providers/AuthProvider.tsx](/Users/earmantrading23/Documents/PictureMe/frontend/src/providers/AuthProvider.tsx): Tracks the current session and still contains one direct `public.users` read that should be replaced with `GET /api/account`.
- [frontend/src/lib/api.ts](/Users/earmantrading23/Documents/PictureMe/frontend/src/lib/api.ts): Central request layer. It should prefer the backend and still contains a fallback branch that routes `/api/*` traffic into Supabase when `VITE_API_BASE_URL` is missing.
- [frontend/src/lib/supabaseApi.ts](/Users/earmantrading23/Documents/PictureMe/frontend/src/lib/supabaseApi.ts): Temporary Supabase-backed implementation for routes that now exist in the backend. This file should be retired.
- [frontend/src/pages](/Users/earmantrading23/Documents/PictureMe/frontend/src/pages): Route-level UI for signup, login, dashboard, event gallery, event settings, join flow, and account settings.
- [frontend/src/components](/Users/earmantrading23/Documents/PictureMe/frontend/src/components): Reusable UI building blocks such as navigation, upload modal, photo grids, and route guards.

## Remaining Backend Integration Cleanup

- Keep Supabase Auth in the browser for login/session handling.
- Set `VITE_API_BASE_URL` in every non-demo environment so authenticated product flows always hit the backend.
- Remove the direct-to-Supabase API fallback in [frontend/src/lib/api.ts](/Users/earmantrading23/Documents/PictureMe/frontend/src/lib/api.ts).
- Remove the temporary route shim in [frontend/src/lib/supabaseApi.ts](/Users/earmantrading23/Documents/PictureMe/frontend/src/lib/supabaseApi.ts). It still references stale fields such as `face_indexed_at` and `rekognition_face_id`.
- Replace the direct `users` table read in [frontend/src/providers/AuthProvider.tsx](/Users/earmantrading23/Documents/PictureMe/frontend/src/providers/AuthProvider.tsx) with `GET /api/account`.
- Treat the backend as the source of truth for:
  - dashboard aggregates
  - account/profile state
  - face-profile lifecycle
  - event create/read/update/delete
  - event membership management
  - gallery reads and share tokens
  - admin photo uploads
  - async matching and cleanup side effects
