# Project Structure

## Repository Purpose

This repository contains the code and documentation for PictureMe, an event photo matching platform built around account-based face registration, event creation, event-specific roles, gallery uploads, personalized galleries, and event history.

## Major Folders

### [frontend](/Users/tervin23/Documents/AG/PictureMe/frontend)

Purpose:

- Hosts the attendee-facing and organizer-facing web experience.
- Contains account creation, login, dashboard, event gallery, account settings, and event settings screens.
- Owns the browser-side Supabase connection used for auth and temporary direct data access before the backend is implemented.

Current state:

- Active Vite + React frontend with Supabase auth wiring and route-level UI implementation.

Documentation:

- [Frontend Notes](/Users/tervin23/Documents/AG/PictureMe/docs/frontend.md)

### [backend](/Users/tervin23/Documents/AG/PictureMe/backend)

Purpose:

- Hosts the Python + FastAPI backend service.
- Owns API routing, Supabase JWT validation, protected runtime configuration boundaries, and the orchestration layer for event, gallery, upload, and matching workflows.
- Coordinates the integrations with Supabase, AWS Rekognition, and Cloudinary as later stages are implemented.

Current state:

- Stage 1 foundation scaffolded with FastAPI app bootstrapping, config validation, dependencies, middleware, and health/runtime-config routes.

Documentation:

- [Backend Notes](/Users/tervin23/Documents/AG/PictureMe/docs/backend.md)

### [docs](/Users/tervin23/Documents/AG/PictureMe/docs)

Purpose:

- Stores project-level documentation.
- Defines the intended scope, architecture direction, and folder responsibilities.

Current files:

- `scope.md`: Defines the product goal, core moving parts, and scope limits.
- `project-structure.md`: Describes the main folders and their responsibilities.
- `backendPlan.md`: Breaks backend implementation into staged delivery milestones tied to the documented product flow.
- `frontend.md`: Documents the current frontend structure and Supabase integration boundary.
