import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicGalleryPage } from "./PublicGalleryPage";
import { apiFetch } from "../lib/api";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("PublicGalleryPage", () => {
  it("shows only the shared gallery without signup prompts", async () => {
    mockedApiFetch.mockResolvedValue({
      event: {
        id: "event-1",
        name: "Launch Party",
        date: "2026-05-10",
      },
      sharedBy: {
        id: "user-1",
        name: "Jordan",
      },
      photos: [
        {
          id: "photo-1",
          cloudinaryUrl: "https://example.com/photo.jpg",
          thumbnailUrl: "https://example.com/photo-thumb.jpg",
          uploadedAt: "2026-05-10T00:00:00Z",
          faceCount: 1,
          matchedAt: "2026-05-10T00:00:00Z",
          similarityScore: 98,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/gallery/gallery-token"]}>
        <Routes>
          <Route path="/gallery/:token" element={<PublicGalleryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Shared gallery")).toBeInTheDocument();
    expect(screen.getByText("Launch Party")).toBeInTheDocument();
    expect(screen.queryByText("Want your own gallery?")).not.toBeInTheDocument();
    expect(screen.queryByText("Join PictureMe for future events")).not.toBeInTheDocument();
  });
});
