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
});
