import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { JoinEventPage } from "./JoinEventPage";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { signInWithGoogleOAuth } from "../lib/oauth";
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

vi.mock("../lib/oauth", () => ({
  signInWithGoogleOAuth: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  },
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedApiFetch = vi.mocked(apiFetch);
const mockedSignIn = vi.mocked(supabase.auth.signInWithPassword);
const mockedGoogleSignIn = vi.mocked(signInWithGoogleOAuth);

describe("JoinEventPage", () => {
  it("shows a public event gallery to anonymous visitors", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: null,
      user: null,
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/join/demo-token") {
        return {
          id: "event-1",
          name: "Demo Event",
          date: "2026-06-21",
          hostName: "Avery",
          photoCount: 42,
          memberCount: 9,
          status: "active",
          joinToken: "demo-token",
          privateGallery: false,
        };
      }

      if (path === "/api/events/join/demo-token/gallery") {
        return {
          event: {
            id: "event-1",
            name: "Demo Event",
            date: "2026-06-21",
            hostName: "Avery",
            photoCount: 42,
            memberCount: 9,
            status: "active",
            joinToken: "demo-token",
          },
          photos: [
            {
              id: "photo-1",
              cloudinaryUrl: "https://example.com/photo.jpg",
              thumbnailUrl: "https://example.com/photo-thumb.jpg",
              uploadedAt: "2026-06-21T00:00:00Z",
              faceCount: 1,
            },
          ],
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/join/demo-token"]}>
        <Routes>
          <Route path="/join/:token" element={<JoinEventPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Demo Event")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join with google/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Or with email")).not.toBeInTheDocument();
  });

  it("auto-joins the event when an authenticated user opens the invite link", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: { access_token: "token" } as never,
      user: {
        id: "user-1",
        email: "guest@example.com",
        name: "Jordan",
        hasFaceProfile: false,
      },
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/join/demo-token") {
        return {
          id: "event-1",
          name: "Demo Event",
          date: "2026-06-21",
          hostName: "Avery",
          photoCount: 42,
          memberCount: 9,
          status: "active",
          joinToken: "demo-token",
          alreadyJoined: false,
        };
      }

      if (path === "/api/events/event-1/join") {
        return {};
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/join/demo-token"]}>
        <Routes>
          <Route path="/join/:token" element={<JoinEventPage />} />
          <Route path="/event/:id" element={<div>Joined gallery</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Joined gallery")).toBeInTheDocument();
    });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/events/event-1/join", {
      method: "POST",
    });
  });

  it("shows the empty public gallery state to anonymous visitors", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: null,
      user: null,
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/join/demo-token") {
        return {
          id: "event-1",
          name: "Demo Event",
          date: "2026-06-21",
          hostName: "Avery",
          photoCount: 42,
          memberCount: 9,
          status: "active",
          joinToken: "demo-token",
          privateGallery: false,
        };
      }

      if (path === "/api/events/join/demo-token/gallery") {
        return {
          event: {
            id: "event-1",
            name: "Demo Event",
            date: "2026-06-21",
            hostName: "Avery",
            photoCount: 42,
            memberCount: 9,
            status: "active",
            joinToken: "demo-token",
          },
          photos: [],
        };
      }

      if (path === "/api/events/event-1/join") {
        return {};
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/join/demo-token"]}>
        <Routes>
          <Route path="/join/:token" element={<JoinEventPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Demo Event")).toBeInTheDocument();
    expect(screen.getByText("No photos uploaded yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log in/i })).not.toBeInTheDocument();
    expect(mockedSignIn).not.toHaveBeenCalled();
  });

  it("shows the auth invite flow for private gallery links", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: null,
      user: null,
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/join/demo-token") {
        return {
          id: "event-1",
          name: "Private Event",
          date: "2026-06-21",
          hostName: "Avery",
          photoCount: 42,
          memberCount: 9,
          status: "active",
          joinToken: "demo-token",
          privateGallery: true,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/join/demo-token"]}>
        <Routes>
          <Route path="/join/:token" element={<JoinEventPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Private Event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join with google/i })).toBeInTheDocument();
    expect(screen.queryByText("No photos uploaded yet")).not.toBeInTheDocument();
  });

  it("does not start Google auth while the public gallery is directly available", async () => {
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: null,
      user: null,
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });
    mockedGoogleSignIn.mockResolvedValue(undefined);
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/join/demo-token") {
        return {
          id: "event-1",
          name: "Demo Event",
          date: "2026-06-21",
          hostName: "Avery",
          photoCount: 42,
          memberCount: 9,
          status: "active",
          joinToken: "demo-token",
          privateGallery: false,
        };
      }

      if (path === "/api/events/join/demo-token/gallery") {
        return {
          event: {
            id: "event-1",
            name: "Demo Event",
            date: "2026-06-21",
            hostName: "Avery",
            photoCount: 42,
            memberCount: 9,
            status: "active",
            joinToken: "demo-token",
          },
          photos: [],
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/join/demo-token"]}>
        <Routes>
          <Route path="/join/:token" element={<JoinEventPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Demo Event")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join with google/i })).not.toBeInTheDocument();
    expect(mockedGoogleSignIn).not.toHaveBeenCalled();
  });

  it("shows invite debug details when preview loading fails", async () => {
    const { ApiError } = await import("../lib/api");
    mockedUseAuth.mockReturnValue({
      loading: false,
      session: null,
      user: null,
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });
    mockedApiFetch.mockRejectedValue(
      new ApiError({
        message: "This invite link is no longer available",
        status: 404,
        code: "INVITE_NOT_FOUND",
        requestId: "request-1",
        path: "/api/events/join/bad-token",
        details: { tokenFingerprint: "abc123", tokenLength: 9 },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/join/bad-token"]}>
        <Routes>
          <Route path="/join/:token" element={<JoinEventPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Invite unavailable")).toBeInTheDocument();
    expect(screen.getByText("Debug details")).toBeInTheDocument();
    expect(screen.getByText(/path: \/api\/events\/join\/bad-token/i)).toBeInTheDocument();
    expect(screen.getByText(/status: 404/i)).toBeInTheDocument();
    expect(screen.getByText(/code: INVITE_NOT_FOUND/i)).toBeInTheDocument();
    expect(screen.getByText(/request id: request-1/i)).toBeInTheDocument();
    expect(screen.getByText(/tokenFingerprint/i)).toBeInTheDocument();
  });
});
