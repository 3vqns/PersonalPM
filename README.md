# PictureMe

PictureMe is an event photo delivery platform that helps attendees find every professional photo they appear in without manually searching through a large gallery.

Users create an account, register their face during sign-up, and then use that face profile across events. Any user can create and host an event, which makes them that event's organizer. Organizers can upload photos, manage the event gallery, invite contributors who can also upload photos, and control those permissions per event. Other users can attend events and view gallery photos without receiving those advanced management privileges.

## Project Idea

PictureMe is designed to solve a common event problem:

- Organizers and photographers produce hundreds or thousands of photos.
- Attendees rarely have time to browse everything manually.
- Most people only care about the photos they are actually in.

The core idea is to combine account based face registration, event-level roles, event check-in, and automated face matching so attendees can quickly access the photos that matter to them while organizers retain control of each event gallery.

## Intended User Flow

1. A user creates an account and scans their face so it can be registered to their profile.
2. Any user can create an event, which makes them the Event Organizer for that event.
3. The Event Organizer generates an event QR code and can also manually add attendees.
4. The Event Organizer can upload photos, manage the event gallery, invite contributors, and remove contributor privileges when needed.
5. Invited contributors can upload photos to that event and manage the photos they personally uploaded.
6. Attendees are associated with the event either by scanning the QR code or by being manually added by the organizer.
7. The platform processes uploaded images and compares detected faces against registered user face data.
8. Users receive a text message when new event pictures have been uploaded.
9. Inside the app, users can view their personal matched photos, browse the full gallery, and review all of their previous events.

## APIs And Tools Used

The competition requires clear API attribution. These are the core services and supporting tools used by PictureMe.

### Core APIs

#### AWS Rekognition
Link: [AWS Rekognition](https://aws.amazon.com/rekognition/)

Used for:

- Face registration during account creation
- Face detection in uploaded event photos
- Face matching between registered users and uploaded event photos
- Creating the facial data needed for personalized gallery identification

#### Cloudinary
Link: [Cloudinary Developers](https://cloudinary.com/developers)

Used for:

- Storing uploaded event photos
- Managing transformed and optimized photo assets
- Delivering personalized gallery images efficiently to attendees

#### Twilio SMS
Link: [Twilio SMS](https://www.twilio.com/en-us/messaging/channels/sms)

Used for:

- Sending notifications when new event photos are uploaded
- Delivering personalized gallery links directly to attendee phones
- Powering event-related SMS communication

#### Supabase
Link: [Supabase Docs](https://supabase.com/docs)

Used for:

- Application database storage
- User account data and registered face metadata management
- Event, attendee, organizer, contributor, and gallery metadata management
- Face embedding storage and similarity search with `pgvector`
- Backend data access and application state management

### Supporting Tool

#### qrcode.react
Link: [qrcode.react on npm](https://www.npmjs.com/package/qrcode.react)

Used for:

- Generating event-specific QR codes in the frontend
- Giving attendees a fast mobile entry point into the event registration flow

## Why This Stack Fits The Product

- `AWS Rekognition` handles the computer vision portion of the product.
- `Supabase` stores user, event, organizer, contributor, attendee, and gallery data while enabling face similarity workflows with `pgvector`.
- `Cloudinary` manages media storage and delivery for event photos.
- `Twilio SMS` closes the loop by notifying users when event photos are uploaded and delivering gallery access to the attendee.
- `qrcode.react` provides a simple attendee onboarding mechanism at the event itself.

## Core Product Features

- Account creation with face registration tied to the user profile
- User-created events with per-event organizer privileges
- Event check-in through QR code scanning
- Manual attendee assignment by organizers when needed
- Organizer-managed contributor access per event
- Organizer and contributor photo uploads for each event
- Per-event gallery management by the Event Organizer
- Personal photo gallery based on registered face matching
- Full event gallery browsing
- Previous event history for each user

## Current Repository Structure

- [frontend](/Users/tervin23/Documents/AG/PictureMe/frontend): Frontend application for account creation, event QR flow, and gallery access.
- [backend](/Users/tervin23/Documents/AG/PictureMe/backend): Backend services for ingestion, matching, storage coordination, and messaging.
- [docs](/Users/tervin23/Documents/AG/PictureMe/docs): Project scope and architecture notes.

## Documentation

- [Project Scope](/Users/tervin23/Documents/AG/PictureMe/docs/scope.md)
- [Project Structure](/Users/tervin23/Documents/AG/PictureMe/docs/project-structure.md)
