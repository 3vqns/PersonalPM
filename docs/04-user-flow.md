# PictureMe — full user flow

## Viewing photos — member experience

### Step 1 — Open an event
From the user's dashboard, they click an event they have joined. The gallery page loads.

> **You must be signed in to view this page.** Unauthenticated users are redirected to the login or signup page, with the event join token preserved so they land back after authenticating.

### Step 2 — "My Photos" tab (default)
Shows only photos where this user's face profile has been matched.

**Matching runs at two moments:**
- When the user first joins the event, a background job uses their saved enrollment selfies to search the already-indexed event collection
- When an admin uploads new photos, background jobs re-check those new faces against each existing member who has a face profile

If the user has no face profile because they opted out, this tab shows an empty state with a prompt: *"Complete your face profile in Account Settings to see your photos here."*

**APIs:** Rekognition `SearchFacesByImage`, Supabase `user_photo_matches` table, FastAPI background tasks

### Step 3 — "All Photos" tab
Shows every photo uploaded to the event in a responsive grid, sorted newest-first unless the organizer later chooses another ordering. Any member can view all photos regardless of face profile status.

Clicking a photo opens it full size with:
- Download button using the original Cloudinary image
- Share button that copies a direct link to that photo

**APIs:** Cloudinary CDN photo delivery, Supabase `photos` SELECT WHERE `event_id`

### Step 4 — Real-time updates
When an admin uploads new photos, the gallery updates live:
- New photos appear in All Photos without a page refresh
- My Photos count updates automatically if new matches are found for the current user

**APIs:** Supabase real-time subscriptions on `photos` and `user_photo_matches`

### Step 5 — Download & share
- Individual photo: download button on full-size view
- All my photos: **Download All** button in My Photos tab using a generated archive flow
- Shareable gallery link: users can copy a public token URL for their My Photos view, which is useful for sharing with family who are not on PictureMe

**APIs:** Cloudinary download URL with attachment behavior, Supabase `gallery_tokens` table

---

## Photo upload triggers re-match for all members

When an admin uploads a new batch of photos:

```
For each new photo:
  1. Upload to Cloudinary and get cloudinary_url
  2. Send to Rekognition IndexFaces and get FaceIds for all detected faces
  3. Store each FaceId in face_index linked to photo_id and event_id

For each event member with a completed face profile:
  1. Fetch the member's 3–5 private enrollment selfies
  2. Run Rekognition SearchFacesByImage against the event collection
  3. Write any new matches to user_photo_matches
  4. Supabase real-time fires and updates My Photos live
```

This runs as a background job. Upload confirmation is shown to the admin immediately while matching continues asynchronously.

---

## Gallery expiry — user experience

- A persistent countdown banner appears on all event gallery pages when expiry is within 14 days
- *"This gallery expires on [date]. Download your photos before then."*
- After expiry, the event page shows: *"This gallery has expired. Photos have been deleted after 30 days."*
- The event still appears in the user's dashboard as an expired event with name and date visible, but no photos

---

## Navigation structure

```
pictureme.app/
├── /                     → Landing page when logged out, dashboard redirect when logged in
├── /signup               → Sign up + optional face profile enrollment
├── /login                → Log in
├── /dashboard            → User's events joined and created
├── /join/[token]         → Join event page with inline auth if needed
├── /event/[id]           → Event gallery with My Photos + All Photos tabs
├── /event/[id]/settings  → Event settings for creator
├── /gallery/[token]      → Public read-only My Photos share
├── /event-gallery/[token] → Public read-only full gallery share
└── /account/settings     → Profile + face profile management
```
