# Frontend

## Purpose

The frontend in [frontend](/Users/tervin23/Documents/AG/PersonalPM/frontend) is the browser application for PictureMe. It keeps Supabase browser auth for login/session handling while product data flows through the FastAPI API.

## Key Files

- [frontend/src/lib/supabase.ts](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/lib/supabase.ts): Initializes the Supabase browser auth client from Vite environment variables.
- [frontend/src/lib/authSession.ts](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/lib/authSession.ts): Reads Supabase's persisted browser session, avoids repeated `getSession()` calls for healthy tokens, and falls back to cached valid credentials if a session check times out.
- [frontend/src/providers/AuthProvider.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/providers/AuthProvider.tsx): Tracks the current session, hydrates the visible user from a cached Supabase session on refresh, and enriches account state through `GET /api/account`.
- [frontend/src/lib/api.ts](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/lib/api.ts): Central request layer. It attaches the current Supabase access token and sends non-demo product traffic to the backend API through `VITE_API_BASE_URL`. Optional-auth GET requests retry anonymously after a stale-token `401`, and failed requests surface `ApiError` metadata for support debugging.
- [frontend/src/pages](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/pages): Route-level UI for signup, login, dashboard, event gallery, event settings, join flow, and account settings.
- [frontend/src/components](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/components): Reusable UI building blocks such as navigation, upload modal, share modal, photo grids, and route guards.

## Current Gallery And Upload Behavior

- [frontend/src/pages/EventGalleryPage.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/pages/EventGalleryPage.tsx): Shows event metadata, including the event description, and uses one header Share button that opens a modal for personal gallery sharing or full gallery sharing. Both share options are read-only public gallery views and do not register viewers for the event.
- [frontend/src/pages/PublicGalleryPage.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/pages/PublicGalleryPage.tsx): Renders public tokenized gallery views for `/gallery/{token}` personal shares and `/event-gallery/{token}` full-event shares.
- [frontend/src/components/EventCard.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/components/EventCard.tsx): Shows event details and the event location on dashboard cards instead of placeholder venue copy.
- [frontend/src/pages/EventPeoplePage.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/pages/EventPeoplePage.tsx): Uses tabs for signed-in users and anonymous uploaders. Owners can promote or demote admins from the Users tab.
- [frontend/src/pages/EventPeoplePage.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/pages/EventPeoplePage.tsx): Lets owners and admins remove signed-in members from the Users tab. Removal fully removes event membership so the event disappears from that user's dashboard.
- [frontend/src/pages/EventSettingsPage.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/pages/EventSettingsPage.tsx): Lets event owners and admins update description, location, and anonymous uploads. Only owners see the event deletion controls.
- [frontend/src/components/PhotoLightbox.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/components/PhotoLightbox.tsx): Shows the display name of the person who uploaded a photo next to the lightbox Share button when uploader metadata exists.
- [frontend/src/components/UploadModal.tsx](/Users/tervin23/Documents/AG/PersonalPM/frontend/src/components/UploadModal.tsx): Shows the 100-photo batch cap and blocks over-limit selections before any upload request starts.

## Current Gallery Access Behavior

- Private gallery mode is currently disabled. The frontend does not expose a private-gallery checkbox or private access list.
- Event gallery access is based on event membership. Owners, admins, and members can view the event gallery.
- Event gallery share links and QR codes do not use join tokens. Personal Gallery Share uses `/gallery/{token}` and Full Gallery Share uses `/event-gallery/{token}` so signed-in and signed-out visitors can view the shared photos without changing event membership.
- Join Event links and QR codes live in event settings only. `/join/{token}` is for signed-in registration and adds or repairs event membership.
- Gallery load failures show safe troubleshooting copy to normal users and a request reference when one exists. Local development builds can show endpoint/code/details behind the troubleshooting panel for debugging.

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
