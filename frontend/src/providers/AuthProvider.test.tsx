import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuthContext } from "./AuthProvider";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../lib/demo", () => ({
  disableDemoMode: vi.fn(),
  enableDemoMode: vi.fn(),
  getDemoSession: vi.fn(() => null),
  getDemoUser: vi.fn(() => null),
  isDemoMode: vi.fn(() => false),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedGetSession = vi.mocked(supabase.auth.getSession);
const mockedOnAuthStateChange = vi.mocked(supabase.auth.onAuthStateChange);

function AuthStateProbe() {
  const { loading, user } = useAuthContext();

  if (loading) {
    return <div>Loading</div>;
  }

  return (
    <div>
      <span>{user?.name ?? "No user"}</span>
      <span>{user?.hasFaceProfile ? "Has face profile" : "No face profile"}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    mockedOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the auth user from the backend account endpoint", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1",
            email: "guest@example.com",
            user_metadata: {
              name: "Metadata Name",
            },
          },
        },
      },
    } as never);
    mockedApiFetch.mockResolvedValue({
      user: {
        id: "user-1",
        email: "guest@example.com",
        name: "Backend Name",
        avatarUrl: "https://example.com/avatar.png",
        hasFaceProfile: true,
      },
    });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Backend Name")).toBeInTheDocument();
      expect(screen.getByText("Has face profile")).toBeInTheDocument();
    });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/account");
  });

  it("falls back to session metadata when the backend account request fails", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-2",
            email: "fallback@example.com",
            user_metadata: {
              full_name: "Fallback Name",
              has_face_profile: false,
            },
          },
        },
      },
    } as never);
    mockedApiFetch.mockRejectedValue(new Error("backend unavailable"));

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Fallback Name")).toBeInTheDocument();
      expect(screen.getByText("No face profile")).toBeInTheDocument();
    });
  });
});
