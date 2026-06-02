import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EventPeoplePage } from "./EventPeoplePage";
import { apiFetch } from "../lib/api";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("EventPeoplePage", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("lets event creators manage user roles from the users tab", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/events/event-1/people") {
        return {
          event: {
            id: "event-1",
            name: "Launch Party",
            date: "2026-05-10",
            status: "active",
            joinToken: "join-token",
            role: "creator",
            privateGallery: false,
            galleryAccessStatus: "owner",
            creator: { id: "creator-1", name: "Taylor" },
            counts: { allPhotos: 8, myPhotos: 1, members: 2 },
          },
          people: [
            {
              id: "creator-1",
              name: "Taylor",
              email: "taylor@example.com",
              role: "creator",
              kind: "member",
              uploadCount: 2,
            },
            {
              id: "user-2",
              name: "Alex",
              email: "alex@example.com",
              role: "member",
              kind: "member",
              uploadCount: 1,
            },
          ],
        };
      }

      if (path === "/api/events/event-1/members/user-2") {
        return { success: true };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/event/event-1/people"]}>
        <Routes>
          <Route path="/event/:id/people" element={<EventPeoplePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Make admin" }));

    expect(screen.getByRole("button", { name: "Remove admin" })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/api/events/event-1/members/user-2",
        expect.objectContaining({
          method: "PATCH",
          body: { role: "admin" },
        }),
      );
    });
  });
});
