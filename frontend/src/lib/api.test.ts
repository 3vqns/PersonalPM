import { apiFetch, ApiError } from "./api";
import { getCurrentSession } from "./authSession";

vi.mock("./demo", () => ({
  getDemoApiResponse: vi.fn(),
  isDemoMode: vi.fn(() => false),
}));

vi.mock("./authSession", () => ({
  getCurrentSession: vi.fn(),
}));

const mockedGetCurrentSession = vi.mocked(getCurrentSession);

describe("apiFetch", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
    mockedGetCurrentSession.mockReset();
    vi.unstubAllGlobals();
  });

  it("retries optional GET requests without auth after a stale token 401", async () => {
    mockedGetCurrentSession.mockResolvedValue({
      access_token: "stale-token",
      refresh_token: "refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      user: { id: "user-1" },
    } as never);

    const sentAuthorizationHeaders: Array<string | null> = [];
    const fetchMock = vi.fn().mockImplementation(async (_url, request: RequestInit) => {
      sentAuthorizationHeaders.push((request.headers as Headers).get("Authorization"));
      if (sentAuthorizationHeaders.length === 1) {
        return new Response(JSON.stringify({ message: "Invalid bearer token", code: "UNAUTHORIZED" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "event-1", name: "Invite" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/events/join/token", { auth: "optional" })).resolves.toEqual({
      id: "event-1",
      name: "Invite",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentAuthorizationHeaders).toEqual(["Bearer stale-token", null]);
  });

  it("throws ApiError with backend diagnostics", async () => {
    mockedGetCurrentSession.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "This invite link is no longer available",
            code: "INVITE_NOT_FOUND",
            details: { tokenFingerprint: "abc123" },
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "X-Request-ID": "request-1",
            },
          },
        ),
      ),
    );

    await expect(apiFetch("/api/events/join/bad-token", { auth: false })).rejects.toMatchObject({
      name: "ApiError",
      message: "This invite link is no longer available",
      status: 404,
      code: "INVITE_NOT_FOUND",
      requestId: "request-1",
      path: "/api/events/join/bad-token",
      details: { tokenFingerprint: "abc123" },
    } satisfies Partial<ApiError>);
  });
});
