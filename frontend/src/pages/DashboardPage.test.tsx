import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import { apiFetch } from "../lib/api";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("DashboardPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedApiFetch.mockReset();
  });

  it("shows the face-profile banner and hides it when dismissed", async () => {
    const user = userEvent.setup();

    mockedApiFetch.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Jordan Lee",
        email: "jordan@example.com",
        hasFaceProfile: false,
      },
      createdEvents: [],
      joinedEvents: [],
    } as never);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Complete your face profile to see your photos automatically.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(
      screen.queryByText(
        "Complete your face profile to see your photos automatically.",
      ),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem("pictureme.face-banner-dismissed")).toBe(
      "true",
    );
  });

  it("creates an event and navigates to the created gallery route", async () => {
    const user = userEvent.setup();

    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/dashboard") {
        return {
          user: {
            id: "user-1",
            name: "Jordan Lee",
            email: "jordan@example.com",
            hasFaceProfile: true,
          },
          createdEvents: [],
          joinedEvents: [],
        };
      }

      if (path === "/api/events") {
        return { id: "event-99" };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/event/:id" element={<div>Created gallery destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click((await screen.findAllByRole("button", { name: "Create event" }))[0]);
    await user.type(screen.getByLabelText("Event name"), "Spring Gala");
    await user.type(screen.getByLabelText("Event date"), "2026-05-08");
    await user.type(screen.getByLabelText("Description"), "A launch celebration");

    const createForm = screen.getByLabelText("Event name").closest("form");
    if (!createForm) {
      throw new Error("Create event form not found");
    }

    await user.click(within(createForm).getByRole("button", { name: "Create event" }));

    await waitFor(() => {
      expect(screen.getByText("Created gallery destination")).toBeInTheDocument();
    });
  });

  it("filters events by description and tags from the filter modal", async () => {
    const user = userEvent.setup();

    mockedApiFetch.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Jordan Lee",
        email: "jordan@example.com",
        hasFaceProfile: true,
      },
      createdEvents: [
        {
          id: "event-1",
          name: "AI Innovation Day",
          description: "Student venture showcases and startup coaching.",
          date: "2026-04-27",
          location: "Dover",
          tags: ["Conference"],
          coverUrl: null,
          hostName: "Jordan Lee",
          photoCount: 9,
          memberCount: 12,
          memberPreviews: [],
          myPhotosCount: 2,
          status: "active",
          role: "creator",
        },
        {
          id: "event-2",
          name: "CS Game Night",
          description: "Casual matches and team photos.",
          date: "2026-04-29",
          location: "Campus lounge",
          tags: ["Party"],
          coverUrl: null,
          hostName: "Taylor",
          photoCount: 20,
          memberCount: 30,
          memberPreviews: [],
          myPhotosCount: 1,
          status: "active",
          role: "member",
        },
      ],
      joinedEvents: [],
    } as never);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("AI Innovation Day")).toBeInTheDocument();
    expect(screen.getByText("CS Game Night")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.type(screen.getByLabelText("Description or tag keyword"), "venture");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(screen.getByText("AI Innovation Day")).toBeInTheDocument();
    expect(screen.queryByText("CS Game Night")).not.toBeInTheDocument();
  });
});
