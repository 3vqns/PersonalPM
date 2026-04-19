import userEvent from "@testing-library/user-event";
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
          expiresAt: "2026-07-21",
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

  it("logs in inline and joins the event without leaving the join route first", async () => {
    const user = userEvent.setup();
    const refreshSession = vi.fn().mockResolvedValue(undefined);

    mockedUseAuth.mockReturnValue({
      loading: false,
      session: null,
      user: null,
      isDemo: false,
      signOut: vi.fn(),
      refreshSession,
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
          expiresAt: "2026-07-21",
          joinToken: "demo-token",
        };
      }

      if (path === "/api/events/event-1/join") {
        return {};
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    mockedSignIn.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    } as never);

    render(
      <MemoryRouter initialEntries={["/join/demo-token"]}>
        <Routes>
          <Route path="/join/:token" element={<JoinEventPage />} />
          <Route path="/event/:id" element={<div>Joined gallery</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Demo Event")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /log in/i }));
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getAllByRole("button", { name: /^log in$/i })[1]);

    await waitFor(() => {
      expect(screen.getByText("Joined gallery")).toBeInTheDocument();
    });

    expect(mockedSignIn).toHaveBeenCalledWith({
      email: "guest@example.com",
      password: "password123",
    });
    expect(refreshSession).toHaveBeenCalled();
  });

  it("starts Google auth from the invite route", async () => {
    const user = userEvent.setup();

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
          expiresAt: "2026-07-21",
          joinToken: "demo-token",
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
    await user.click(screen.getByRole("button", { name: /join with google/i }));

    expect(mockedGoogleSignIn).toHaveBeenCalledWith("/join/demo-token");
  });
});
