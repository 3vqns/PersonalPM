import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventGalleryPage } from "./EventGalleryPage";
import { useAuth } from "../hooks/useAuth";
import { ApiError, apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    details?: unknown;
    requestId?: string;
    path: string;

    constructor({
      message,
      status,
      code,
      details,
      requestId,
      path,
    }: {
      message: string;
      status: number;
      code?: string;
      details?: unknown;
      requestId?: string;
      path: string;
    }) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.details = details;
      this.requestId = requestId;
      this.path = path;
    }
  },
  apiFetch: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
  },
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedApiFetch = vi.mocked(apiFetch);

describe("EventGalleryPage", () => {
  it("opens on the My Photos tab and shows the face-profile empty state", async () => {
    const user = userEvent.setup();

    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "user-1", email: "me@example.com", name: "Jordan", hasFaceProfile: false },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1") {
        return {
          id: "event-1",
          name: "Launch Party",
          date: "2026-05-10",
          status: "active",
          joinToken: "join-token",
          role: "member",
          creator: { id: "creator-1", name: "Taylor" },
          counts: { allPhotos: 0, myPhotos: 0, members: 5 },
        };
      }

      if (path === "/api/events/event-1/photos") {
        return { photos: [] };
      }

      if (path === "/api/events/event-1/my-photos") {
        return {
          photos: [],
          hasFaceProfile: false,
        };
      }

      if (path === "/api/gallery-tokens") {
        return { token: "gallery-token", url: "https://example.com/gallery/gallery-token" };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Launch Party")).toBeInTheDocument();
    expect(
      screen.getByText("Complete your face profile in Account Settings to see your photos automatically."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /all photos/i }));

    expect(screen.getByText("No photos uploaded yet")).toBeInTheDocument();
    expect(supabase.channel).toHaveBeenCalled();
  });

  it("opens the share modal with the personal gallery link", async () => {
    const user = userEvent.setup();

    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "user-1", email: "me@example.com", name: "Jordan", hasFaceProfile: true },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1") {
        return {
          id: "event-1",
          name: "Launch Party",
          date: "2026-05-10",
          status: "active",
          joinToken: "join-token",
          role: "member",
          creator: { id: "creator-1", name: "Taylor" },
          counts: { allPhotos: 1, myPhotos: 1, members: 5 },
        };
      }

      if (path === "/api/events/event-1/photos") {
        return {
          photos: [
            {
              id: "photo-1",
              cloudinaryUrl: "https://example.com/photo.jpg",
              thumbnailUrl: "https://example.com/photo-thumb.jpg",
              uploadedAt: "2026-05-10T00:00:00Z",
              faceCount: 1,
            },
          ],
        };
      }

      if (path === "/api/events/event-1/my-photos") {
        return {
          photos: [
            {
              id: "photo-1",
              cloudinaryUrl: "https://example.com/photo.jpg",
              thumbnailUrl: "https://example.com/photo-thumb.jpg",
              uploadedAt: "2026-05-10T00:00:00Z",
              faceCount: 1,
              matchedAt: "2026-05-10T00:00:00Z",
              similarityScore: 99,
            },
          ],
          hasFaceProfile: true,
          downloadAllUrl: "https://example.com/download-all.zip",
        };
      }

      if (path === "/api/gallery-tokens") {
        return { token: "gallery-token", url: "https://example.com/gallery/gallery-token" };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Launch Party")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^share$/i }));
    await user.click(await screen.findByRole("button", { name: /share my photos/i }));

    expect(await screen.findByText("Share your photos")).toBeInTheDocument();
    expect(screen.getByText("Gallery link")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/gallery/gallery-token")).toBeInTheDocument();
  });

  it("opens the share modal with the full gallery link", async () => {
    const user = userEvent.setup();

    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "user-1", email: "me@example.com", name: "Jordan", hasFaceProfile: true },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1") {
        return {
          id: "event-1",
          name: "Launch Party",
          date: "2026-05-10",
          status: "active",
          joinToken: "join-token",
          role: "member",
          creator: { id: "creator-1", name: "Taylor" },
          counts: { allPhotos: 2, myPhotos: 1, members: 5 },
        };
      }

      if (path === "/api/events/event-1/photos") {
        return {
          photos: [
            {
              id: "photo-1",
              cloudinaryUrl: "https://example.com/photo.jpg",
              thumbnailUrl: "https://example.com/photo-thumb.jpg",
              uploadedAt: "2026-05-10T00:00:00Z",
              faceCount: 1,
            },
          ],
        };
      }

      if (path === "/api/events/event-1/my-photos") {
        return {
          photos: [
            {
              id: "photo-1",
              cloudinaryUrl: "https://example.com/photo.jpg",
              thumbnailUrl: "https://example.com/photo-thumb.jpg",
              uploadedAt: "2026-05-10T00:00:00Z",
              faceCount: 1,
              matchedAt: "2026-05-10T00:00:00Z",
              similarityScore: 99,
            },
          ],
          hasFaceProfile: true,
        };
      }

      if (path === "/api/gallery-tokens") {
        return { token: "gallery-token", url: "https://example.com/gallery/gallery-token" };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Launch Party")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^share$/i }));
    await user.click(await screen.findByRole("button", { name: /share full gallery/i }));

    expect(
      await screen.findByRole("heading", { name: /share full gallery/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("http://localhost:3000/join/join-token")).toBeInTheDocument();
  });

  it("uses the share modal for newly created events", async () => {
    const user = userEvent.setup();

    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "creator-1", email: "me@example.com", name: "Taylor", hasFaceProfile: true },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1") {
        return {
          id: "event-1",
          name: "Launch Party",
          date: "2026-05-10",
          status: "active",
          joinToken: "join-token",
          role: "creator",
          creator: { id: "creator-1", name: "Taylor" },
          counts: { allPhotos: 0, myPhotos: 0, members: 1 },
        };
      }

      if (path === "/api/events/event-1/photos") {
        return { photos: [] };
      }

      if (path === "/api/events/event-1/my-photos") {
        return {
          photos: [],
          hasFaceProfile: true,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1?created=1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Launch Party")).toBeInTheDocument();
    expect(screen.queryByText("Share this event instantly")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^share$/i }));
    await user.click(await screen.findByRole("button", { name: /share full gallery/i }));

    expect(screen.getByText("http://localhost:3000/join/join-token")).toBeInTheDocument();
  });

  it("shows the event settings link to admins", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "admin-1", email: "admin@example.com", name: "Admin", hasFaceProfile: true },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1") {
        return {
          id: "event-1",
          name: "Launch Party",
          date: "2026-05-10",
          status: "active",
          joinToken: "join-token",
          role: "admin",
          creator: { id: "creator-1", name: "Taylor" },
          counts: { allPhotos: 0, myPhotos: 0, members: 2 },
        };
      }

      if (path === "/api/events/event-1/photos") {
        return { photos: [] };
      }

      if (path === "/api/events/event-1/my-photos") {
        return {
          photos: [],
          hasFaceProfile: true,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: /event settings/i })).toHaveAttribute(
      "href",
      "/event/event-1/settings",
    );
  });

  it("shows the top three uploaders by upload count", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "user-1", email: "me@example.com", name: "Jordan", hasFaceProfile: true },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1") {
        return {
          id: "event-1",
          name: "Launch Party",
          date: "2026-05-10",
          status: "active",
          joinToken: "join-token",
          role: "member",
          creator: { id: "creator-1", name: "Taylor" },
          counts: { allPhotos: 7, myPhotos: 1, members: 5 },
        };
      }

      if (path === "/api/events/event-1/photos") {
        return { photos: [] };
      }

      if (path === "/api/events/event-1/my-photos") {
        return {
          photos: [],
          hasFaceProfile: true,
        };
      }

      if (path === "/api/events/event-1/people") {
        return {
          event: {
            id: "event-1",
            name: "Launch Party",
            date: "2026-05-10",
            status: "active",
            joinToken: "join-token",
            role: "member",
            creator: { id: "creator-1", name: "Taylor" },
            counts: { allPhotos: 7, myPhotos: 1, members: 5 },
          },
          people: [
            { id: "uploader-1", name: "Avery Chen", kind: "member", uploadCount: 12 },
            { id: "uploader-2", name: "Jordan Lee", kind: "member", uploadCount: 7 },
            { id: "uploader-3", name: "Casey Guest", kind: "anonymous", uploadCount: 3 },
            { id: "uploader-4", name: "No Photos", kind: "member", uploadCount: 0 },
          ],
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Top uploaders")).toBeInTheDocument();
    expect(screen.getByText("Avery Chen")).toBeInTheDocument();
    expect(screen.getByText("12 uploads")).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getByText("Casey Guest (anonymous)")).toBeInTheDocument();
    expect(screen.queryByText("No Photos")).not.toBeInTheDocument();
  });

  it("keeps the event gallery visible when one photo request fails", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "user-1", email: "me@example.com", name: "Jordan", hasFaceProfile: true },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1") {
        return {
          id: "event-1",
          name: "Launch Party",
          date: "2026-05-10",
          location: "TBD",
          status: "active",
          joinToken: "join-token",
          role: "member",
          creator: { id: "creator-1", name: "Taylor" },
          counts: { allPhotos: 1, myPhotos: 0, members: 5 },
        };
      }

      if (path === "/api/events/event-1/photos") {
        return {
          photos: [
            {
              id: "photo-1",
              cloudinaryUrl: "https://example.com/photo.jpg",
              thumbnailUrl: "https://example.com/photo-thumb.jpg",
              uploadedAt: "2026-05-10T00:00:00Z",
              faceCount: 1,
            },
          ],
        };
      }

      if (path === "/api/events/event-1/my-photos") {
        throw new Error("Could not load your photos");
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Launch Party")).toBeInTheDocument();
    expect(screen.queryByText("Gallery unavailable")).not.toBeInTheDocument();
    expect(screen.getByText(/Some gallery photos could not load/i)).toBeInTheDocument();
  });

  it("repairs a stale missing membership before showing gallery unavailable", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "user-1", email: "me@example.com", name: "Jordan", hasFaceProfile: true },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    let eventLoadCount = 0;
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1") {
        eventLoadCount += 1;
        if (eventLoadCount === 1) {
          throw new Error("You do not have access to this event");
        }

        return {
          id: "event-1",
          name: "Launch Party",
          date: "2026-05-10",
          location: "TBD",
          status: "active",
          joinToken: "join-token",
          role: "member",
          creator: { id: "creator-1", name: "Taylor" },
          counts: { allPhotos: 0, myPhotos: 0, members: 5 },
        };
      }

      if (path === "/api/events/event-1/join") {
        return { eventId: "event-1", alreadyJoined: false, role: "member" };
      }

      if (path === "/api/events/event-1/photos") {
        return { photos: [] };
      }

      if (path === "/api/events/event-1/my-photos") {
        return {
          photos: [],
          hasFaceProfile: true,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Launch Party")).toBeInTheDocument();
    expect(screen.queryByText("Gallery unavailable")).not.toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/events/event-1/join", {
      method: "POST",
    });
  });

  it("shows endpoint and backend code when the event load fails", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: { id: "user-1", email: "me@example.com", name: "Jordan", hasFaceProfile: true },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockRejectedValue(
      new ApiError({
        message: "Request access before viewing this private gallery",
        status: 403,
        code: "GALLERY_ACCESS_REQUIRED",
        requestId: "request-1",
        path: "/api/events/event-1",
      }),
    );

    render(
      <MemoryRouter initialEntries={["/event/event-1"]}>
        <Routes>
          <Route path="/event/:id" element={<EventGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Gallery unavailable")).toBeInTheDocument();
    expect(screen.getByText(/You do not currently have access to this gallery/i)).toBeInTheDocument();
    expect(screen.getByText("Troubleshooting details")).toBeInTheDocument();
    expect(screen.getByText("GALLERY_ACCESS_REQUIRED")).toBeInTheDocument();
    expect(screen.getByText("request-1")).toBeInTheDocument();
  });
});
