import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRouter } from "./router";
import { useAuth } from "../hooks/useAuth";

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../pages/LandingPage", () => ({
  LandingPage: () => <div>Landing page ready</div>,
}));

vi.mock("../pages/AccountSettingsPage", () => ({
  AccountSettingsPage: () => <div>Account settings</div>,
}));

vi.mock("../pages/DashboardPage", () => ({
  DashboardPage: () => <div>Dashboard</div>,
}));

vi.mock("../pages/EventGalleryPage", () => ({
  EventGalleryPage: () => <div>Event gallery</div>,
}));

vi.mock("../pages/EventSettingsPage", () => ({
  EventSettingsPage: () => <div>Event settings</div>,
}));

vi.mock("../pages/JoinEventPage", () => ({
  JoinEventPage: () => <div>Join event</div>,
}));

vi.mock("../pages/LoginPage", () => ({
  LoginPage: () => <div>Login</div>,
}));

vi.mock("../pages/PublicGalleryPage", () => ({
  PublicGalleryPage: () => <div>Public gallery</div>,
}));

vi.mock("../pages/SignupPage", () => ({
  SignupPage: () => <div>Signup</div>,
}));

const mockedUseAuth = vi.mocked(useAuth);

describe("AppRouter", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the public landing page while auth is still loading", () => {
    mockedUseAuth.mockReturnValue({
      loading: true,
      session: null,
      user: null,
      isDemo: false,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      startDemo: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRouter />
      </MemoryRouter>,
    );

    expect(screen.getByText("Landing page ready")).toBeInTheDocument();
    expect(screen.queryByText("Loading PictureMe...")).not.toBeInTheDocument();
  });
});
