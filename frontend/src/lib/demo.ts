import type { Session } from "@supabase/supabase-js";
import type {
  AccountResponse,
  AllPhotosResponse,
  AuthUser,
  DashboardResponse,
  EventDetail,
  EventMember,
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
    faceCount: 4,
  },
  {
    id: "photo-2",
    cloudinaryUrl:
      "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=1200&q=80",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=640&q=80",
    uploadedAt: "2026-05-10T18:10:00.000Z",
    faceCount: 2,
  },
  {
    id: "photo-3",
    cloudinaryUrl:
      "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=640&q=80",
    uploadedAt: "2026-05-10T18:20:00.000Z",
    faceCount: 6,
  },
];

const demoEvent: EventDetail = {
  id: "demo-event",
  name: "Spring Gala",
  description: "A private gallery for a PictureMe demo event.",
  date: "2026-05-10",
  expiresAt: "2026-06-09",
  status: "active",
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
          date: demoEvent.date,
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
        },
      ],
      joinedEvents: [
        {
          id: "demo-conference",
          name: "Founder Summit",
          date: "2026-07-18",
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
        description:
          typeof options.body.description === "string"
            ? options.body.description
            : demoEvent.description,
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
      hostName: demoUser.name,
      coverUrl: demoEvent.coverUrl,
      photoCount: demoPhotos.length,
      memberCount: demoEvent.counts.members,
      status: "active",
      expiresAt: demoEvent.expiresAt,
      joinToken: demoEvent.joinToken,
      alreadyJoined: true,
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
