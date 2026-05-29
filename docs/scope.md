# PictureMe Scope

## End Goal

Build a product that allows users to register their face to their account once, create and host events, assign event-specific upload permissions, join events through QR check-in or organizer assignment, and automatically receive access to the professional photos they appear in whenever event photos are uploaded.

## Core Moving Parts

### Photo Ingestion

- Event Organizers can upload event photo sets to a specific event.
- Event Organizers can invite contributors who are also allowed to upload photos to that event.
- Contributors can manage the photos they personally uploaded.
- The system stores and organizes event images for later processing and delivery.

### Event Roles And Permissions

- Any user can create an event and become that event's Event Organizer.
- The Event Organizer can manage the event, manage the gallery, and control contributor permissions for that event.
- The Event Organizer can invite other users as contributors and remove that privilege later.
- Contributors can upload photos and manage only the photos they uploaded.
- Non-privileged users can view allowed gallery photos but do not have organizer or contributor permissions.

### User Registration And Face Enrollment

- Users create accounts in the platform.
- Each user scans their face during sign-up so it can be attached to their account.
- Registered face data becomes the reference identity for future event photo matching.

### Face Detection And Matching

- Faces are detected from uploaded photos.
- The system compares registered user face data against indexed event photo face data.

### Event Enrollment

- Each event exposes a QR code.
- Scanning the QR code registers the user as an attendee for that event.
- Organizers can also manually add users to an event attendee list.

### Personalized Galleries And Notifications

- Matching photos are assembled into a personal user gallery for that event.
- Users can also browse the full event gallery when permitted.
- Users receive SMS notifications when photos are uploaded to events they attended.

### Event History

- Users can review all current and previous events they attended.
- Each event acts as an entry point to personal photos and the broader event gallery.

## In-Scope Integrations

- `AWS Rekognition` for face detection and matching
- `Cloudinary` for photo storage and delivery
- `Twilio SMS` for upload notifications and gallery link delivery
- `Supabase` for database storage and `pgvector` similarity search
- `qrcode.react` for QR code generation in the frontend

## Scope Guardrails

- Prioritize a working end-to-end account registration, event creation, permissions, enrollment, matching, and gallery flow over advanced admin features.
- Prioritize reliable matching and delivery over social or editing features.
- Keep organizer and contributor tools focused on event-specific upload and gallery workflows, not full studio management.

## Success Criteria

- A user can create an account and register their face.
- A user can create an event and become its Event Organizer.
- An Event Organizer can invite or remove contributors for a specific event.
- A user can be attached to an event by QR scan or organizer assignment.
- An Event Organizer can upload event photos.
- A contributor can upload photos to an event and manage their own uploads.
- The system can identify likely matching photos for each registered user.
- A user can view their personal event photos and the full event gallery.
- A user receives text notifications when new event photos are uploaded.
- A user can see a history of previous events.
