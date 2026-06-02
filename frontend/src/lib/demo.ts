import type { Session } from "@supabase/supabase-js";
import type {
  AccountResponse,
  AllPhotosResponse,
  AuthUser,
  DashboardResponse,
  EventDetail,
  EventMember,
  EventPeopleResponse,
  GalleryAccessEntry,
  GalleryAccessRequestResponse,
  GalleryResponse,
  JoinPreview,
  MyPhotosResponse,
  Photo,
  ShareGalleryTokenResponse,
} from "../types";

const DEMO_KEY = "pictureme.demo-mode";

const demoUser: AuthUser = {
  id: "demo-user",
  email: "demo@pictureme.local",
  name: "Jordan Demo",
  hasFaceProfile: true,
  isDemo: true,
};

const demoSession = {
  access_token: "demo-token",
  refresh_token: "demo-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: demoUser.id,
    aud: "authenticated",
    role: "authenticated",
    email: demoUser.email,
    user_metadata: {
      name: demoUser.name,
      has_face_profile: demoUser.hasFaceProfile,
    },
    app_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  },
} as Session;

const demoPhotos: Photo[] = [
  {
    id: "photo-1",
    cloudinaryUrl:
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=640&q=80",
    uploadedAt: "2026-05-10T18:00:00.000Z",
    uploaderName: "Jordan Demo",
    uploaderIsAnonymous: false,
    faceCount: 4,
  },
  {
    id: "photo-2",
    cloudinaryUrl:
      "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=1200&q=80",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=640&q=80",
    uploadedAt: "2026-05-10T18:10:00.000Z",
    uploaderName: "Avery Chen",
    uploaderIsAnonymous: false,
    faceCount: 2,
  },
  {
    id: "photo-3",
    cloudinaryUrl:
      "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=640&q=80",
    uploadedAt: "2026-05-10T18:20:00.000Z",
    uploaderName: "Casey Guest",
    uploaderIsAnonymous: true,
    faceCount: 6,
  },
];

const demoEvent: EventDetail = {
  id: "demo-event",
  name: "Spring Gala",
  description: "A private gallery for a PictureMe demo event.",
  date: "2026-05-10",
  location: "TBD",
  expiresAt: "2026-06-09",
  status: "active",
  privateGallery: false,
  galleryAccessStatus: "owner",
  coverUrl:
    "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80",
  joinToken: "demo-token",
  role: "creator",
  creator: {
    id: demoUser.id,
    name: demoUser.name,
  },
  counts: {
    allPhotos: demoPhotos.length,
    myPhotos: 2,
    members: 24,
  },
};

export function enableDemoMode() {
  try {
    window.localStorage.setItem(DEMO_KEY, "true");
  } catch {
    // Demo mode can still run for the current render.
  }
}

export function disableDemoMode() {
  try {
    window.localStorage.removeItem(DEMO_KEY);
  } catch {
    // Local storage can be unavailable in private windows.
  }
}

export function isDemoMode() {
  try {
    return window.localStorage.getItem(DEMO_KEY) === "true";
  } catch {
    return false;
  }
}

export function getDemoSession() {
  return demoSession;
}

export function getDemoUser() {
  return demoUser;
}

export async function getDemoApiResponse<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
) {
  const method = options.method ?? "GET";

  if (path === "/api/dashboard") {
    return {
      user: demoUser,
      createdEvents: [
        {
          id: demoEvent.id,
          name: demoEvent.name,
          description: demoEvent.description,
          date: demoEvent.date,
          location: demoEvent.location,
          coverUrl: demoEvent.coverUrl,
          hostName: demoUser.name,
          photoCount: demoPhotos.length,
          memberCount: demoEvent.counts.members,
          memberPreviews: [
            {
              id: demoUser.id,
              name: demoUser.name,
              avatarUrl: demoUser.avatarUrl,
            },
            {
              id: "demo-admin",
              name: "Avery Chen",
            },
            {
              id: "demo-member",
              name: "Maya Patel",
            },
          ],
          myPhotosCount: 2,
          daysRemaining: 21,
          status: "active",
          role: "creator",
          privateGallery: demoEvent.privateGallery,
        },
      ],
      joinedEvents: [
        {
          id: "demo-conference",
          name: "Founder Summit",
          description: "Investor sessions, founder portraits, and demo day coverage.",
          date: "2026-07-18",
          location: "Downtown conference center",
          hostName: "Avery Chen",
          photoCount: 84,
          memberCount: 180,
          memberPreviews: [
            {
              id: "demo-admin",
              name: "Avery Chen",
            },
            {
              id: demoUser.id,
              name: demoUser.name,
              avatarUrl: demoUser.avatarUrl,
            },
            {
              id: "demo-member",
              name: "Maya Patel",
            },
          ],
          myPhotosCount: 7,
          daysRemaining: 30,
          status: "active",
          role: "member",
          privateGallery: false,
        },
      ],
    } satisfies DashboardResponse as T;
  }

  if (path === "/api/events" && method === "POST") {
    return { id: demoEvent.id } as T;
  }

  if (/^\/api\/events\/[^/]+$/.test(path)) {
    if (method === "DELETE") {
      return undefined as T;
    }

    if (method === "PATCH" && isRecord(options.body)) {
      return {
        ...demoEvent,
        name:
          typeof options.body.name === "string"
            ? options.body.name
            : demoEvent.name,
        date:
          typeof options.body.date === "string"
            ? options.body.date
            : demoEvent.date,
        location:
          typeof options.body.location === "string"
            ? options.body.location
            : demoEvent.location,
        description:
          typeof options.body.description === "string"
            ? options.body.description
            : demoEvent.description,
        privateGallery:
          typeof options.body.privateGallery === "boolean"
            ? options.body.privateGallery
            : demoEvent.privateGallery,
      } as T;
    }

    return demoEvent as T;
  }

  if (/^\/api\/events\/[^/]+\/photos$/.test(path)) {
    if (method === "POST") {
      return { jobId: "demo-upload-job" } as T;
    }

    return { photos: demoPhotos } satisfies AllPhotosResponse as T;
  }

  if (/^\/api\/events\/[^/]+\/my-photos$/.test(path)) {
    return {
      photos: demoPhotos.slice(0, 2),
      downloadAllUrl: demoPhotos[0]?.cloudinaryUrl,
      hasFaceProfile: true,
    } satisfies MyPhotosResponse as T;
  }

  if (/^\/api\/events\/join\/[^/]+$/.test(path)) {
    return {
      id: demoEvent.id,
      name: demoEvent.name,
      date: demoEvent.date,
      location: demoEvent.location,
      hostName: demoUser.name,
      coverUrl: demoEvent.coverUrl,
      photoCount: demoPhotos.length,
      memberCount: demoEvent.counts.members,
      status: "active",
      expiresAt: demoEvent.expiresAt,
      joinToken: demoEvent.joinToken,
      alreadyJoined: true,
      privateGallery: demoEvent.privateGallery,
      galleryAccessStatus: "owner",
    } satisfies JoinPreview as T;
  }

  if (/^\/api\/events\/[^/]+\/join$/.test(path)) {
    return {} as T;
  }

  if (/^\/api\/events\/[^/]+\/members$/.test(path)) {
    return [
      {
        id: "member-creator",
        userId: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
        role: "creator",
        joinedAt: "2026-05-10T00:00:00.000Z",
      },
      {
        id: "member-admin",
        userId: "demo-admin",
        name: "Avery Chen",
        email: "avery@example.com",
        role: "admin",
        joinedAt: "2026-05-10T00:00:00.000Z",
      },
    ] satisfies EventMember[] as T;
  }

  if (/^\/api\/events\/[^/]+\/people$/.test(path)) {
    return {
      event: demoEvent,
      people: [
        {
          id: demoUser.id,
          name: demoUser.name,
          email: demoUser.email,
          role: "creator",
          joinedAt: "2026-05-10T00:00:00.000Z",
          kind: "member",
          uploadCount: 1,
          galleryAccessStatus: "owner",
        },
        {
          id: "demo-admin",
          name: "Avery Chen",
          email: "avery@example.com",
          role: "admin",
          joinedAt: "2026-05-10T00:00:00.000Z",
          kind: "member",
          uploadCount: 1,
          galleryAccessStatus: "approved",
        },
        {
          id: "anonymous-1",
          name: "Casey Guest",
          kind: "anonymous",
          uploadCount: 1,
        },
      ],
    } satisfies EventPeopleResponse as T;
  }

  if (/^\/api\/events\/[^/]+\/access-requests$/.test(path)) {
    return { status: "pending" } satisfies GalleryAccessRequestResponse as T;
  }

  if (/^\/api\/events\/[^/]+\/gallery-access$/.test(path)) {
    if (method === "POST") {
      return {
        id: "access-demo-member",
        user: {
          id: "demo-member",
          name: "Maya Patel",
          email: "maya@example.com",
        },
        status: "approved",
        requestedAt: "2026-05-10T00:00:00.000Z",
        approvedAt: "2026-05-10T00:00:00.000Z",
      } satisfies GalleryAccessEntry as T;
    }

    return [
      {
        id: "access-demo-admin",
        user: {
          id: "demo-admin",
          name: "Avery Chen",
          email: "avery@example.com",
        },
        status: "approved",
        requestedAt: "2026-05-10T00:00:00.000Z",
        approvedAt: "2026-05-10T00:00:00.000Z",
      },
      {
        id: "access-demo-pending",
        user: {
          id: "demo-member",
          name: "Maya Patel",
          email: "maya@example.com",
        },
        status: "pending",
        requestedAt: "2026-05-11T00:00:00.000Z",
      },
    ] satisfies GalleryAccessEntry[] as T;
  }

  if (/^\/api\/events\/[^/]+\/gallery-access\/[^/]+$/.test(path)) {
    if (method === "DELETE") {
      return { success: true } as T;
    }
    return {
      id: "access-demo-member",
      user: {
        id: "demo-member",
        name: "Maya Patel",
        email: "maya@example.com",
      },
      status: "approved",
      requestedAt: "2026-05-11T00:00:00.000Z",
      approvedAt: "2026-05-11T00:00:00.000Z",
    } satisfies GalleryAccessEntry as T;
  }

  if (/^\/api\/events\/[^/]+\/members\/[^/]+$/.test(path)) {
    return {} as T;
  }

  if (path === "/api/gallery-tokens") {
    return {
      token: "demo-gallery-token",
      url: `${window.location.origin}/gallery/demo-gallery-token`,
    } satisfies ShareGalleryTokenResponse as T;
  }

  if (/^\/api\/gallery\/[^/]+$/.test(path)) {
    return {
      event: {
        id: demoEvent.id,
        name: demoEvent.name,
        date: demoEvent.date,
      },
      sharedBy: {
        id: demoUser.id,
        name: demoUser.name,
      },
      photos: demoPhotos.slice(0, 2),
      downloadAllUrl: demoPhotos[0]?.cloudinaryUrl,
    } satisfies GalleryResponse as T;
  }

  if (path === "/api/account") {
    return { user: demoUser } satisfies AccountResponse as T;
  }

  if (path === "/api/account/profile") {
    return { user: demoUser } satisfies AccountResponse as T;
  }

  if (path === "/api/account/face-profile") {
    return { hasFaceProfile: method !== "DELETE" } as T;
  }

  throw new Error(`Demo response not available for ${method} ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
