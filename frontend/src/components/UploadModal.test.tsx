import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { UploadModal } from "./UploadModal";
import { apiFetch } from "../lib/api";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    isDemo: false,
  }),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../lib/cloudinaryUpload", () => ({
  uploadToCloudinary: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

function makeImageFile(index: number) {
  return new File(["photo"], `photo-${index}.jpg`, { type: "image/jpeg" });
}

describe("UploadModal", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("shows and enforces the 100-photo upload cap", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <UploadModal eventId="event-1" onClose={vi.fn()} />,
    );

    expect(screen.getByText("You can upload up to 100 photos at once")).toBeInTheDocument();

    const fileInput = container.querySelector("input[type='file']");
    expect(fileInput).toBeInstanceOf(HTMLInputElement);

    await user.upload(
      fileInput as HTMLInputElement,
      Array.from({ length: 101 }, (_, index) => makeImageFile(index)),
    );

    expect(
      screen.getByText("You selected 101 photos. Please select 100 or fewer at a time."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start upload/i })).toBeDisabled();
  });

  it("includes the anonymous uploader name on multipart uploads", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue({ jobId: "job-1" });

    const { container } = render(
      <UploadModal
        eventId="event-1"
        uploaderName="Jordan Lee"
        onClose={vi.fn()}
      />,
    );

    const fileInput = container.querySelector("input[type='file']");
    expect(fileInput).toBeInstanceOf(HTMLInputElement);

    await user.upload(
      fileInput as HTMLInputElement,
      new File(["zip"], "photos.zip", { type: "application/zip" }),
    );
    await user.click(screen.getByRole("button", { name: /start upload/i }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/api/events/event-1/photos",
        expect.objectContaining({
          auth: "optional",
          method: "POST",
          body: expect.any(FormData),
        }),
      );
    });

    const [, options] = mockedApiFetch.mock.calls[0];
    const formData = options.body as FormData;
    expect(formData.get("uploader_name")).toBe("Jordan Lee");
  });
});
