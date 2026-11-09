# Project Structure

## Repository Purpose

This repository contains the code and documentation for PictureMe, an event photo matching platform built around account-based face registration, event creation, event-specific roles, gallery uploads, personalized galleries, and event history.

## Major Folders

### [frontend](/Users/tervin23/Documents/AG/PersonalPM/frontend)

Purpose:

- Hosts the attendee-facing and organizer-facing web experience.
- Contains account creation, login, dashboard, event gallery, account settings, and event settings screens.
- Owns browser-side Supabase authentication and the event-gallery interface. Gallery data and uploads use the backend API.

Current state:

- Active Vite + React frontend with Supabase auth wiring and route-level UI implementation.

Documentation:

- [Frontend Notes](/Users/tervin23/Documents/AG/PersonalPM/docs/frontend.md)

### [backend](/Users/tervin23/Documents/AG/PersonalPM/backend)

Purpose:

- Hosts the Python + FastAPI backend service.
- Owns API routing, Supabase JWT validation, protected runtime configuration boundaries, and the orchestration layer for event, gallery, upload, and matching workflows.
- Coordinates the integrations with Supabase, AWS Rekognition, and Cloudinary as later stages are implemented.

Current state:

- Active FastAPI service with account, event, gallery, upload, matching, and cleanup routes. `request_limits.py` caps upload bodies; `services/media_cleanup_service.py` persists and retries provider deletion; `services/face_profile_storage_service.py` writes private enrollment images.

Documentation:

- [Backend Notes](/Users/tervin23/Documents/AG/PersonalPM/docs/backend.md)

### [supabase](/Users/tervin23/Documents/AG/PersonalPM/supabase)

Purpose:

- Stores versioned database and storage migrations for event authority, media cleanup, and matching state.
- `migrations/20261109165624_security_authority_guards.sql` contains the deployed role guards, durable cleanup queues, collection admission, and private enrollment storage. `20261109165829_harden_trigger_search_paths.sql` pins trigger function lookup; both were applied to the connected project on 2026-11-09.

### [docs](/Users/tervin23/Documents/AG/PersonalPM/docs)

Purpose:

- Stores project-level documentation.
- Defines the intended scope, architecture direction, and folder responsibilities.

Current files:

- `scope.md`: Defines the product goal, core moving parts, and scope limits.
- `project-structure.md`: Describes the main folders and their responsibilities.
- `backendPlan.md`: Breaks backend implementation into staged delivery milestones tied to the documented product flow.
- `frontend.md`: Documents the current frontend structure and Supabase integration boundary.
- `implementation-rules.md`: Defines required Supabase syntax, API contract, frontend, and deployment rules for future changes.
- `security-hardening-checkpoints.md`: Maps the 27 saved audit fingerprints to changes, focused checks, and deployment or provider blockers.
- `tdocs/Tasks.md`: Stores the original dad-feedback backlog with detailed implementation notes.
- `tdocs/tasks-implementation-plan.md`: Reorganizes the dad-feedback backlog into four work groups, dependency order, and verification checkpoints.
