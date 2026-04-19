import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventGalleryPage } from "./EventGalleryPage";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/api", () => ({
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
          expiresAt: "2026-05-30",
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

  it("shows the invite-link share panel for my photos", async () => {
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
          expiresAt: "2026-05-30",
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
    expect(await screen.findByText("Share these photos instantly")).toBeInTheDocument();
    expect(screen.getByText("Gallery link")).toBeInTheDocument();
    expect(screen.getByText("http://localhost/join/join-token")).toBeInTheDocument();
  });
});
