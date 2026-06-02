import { Home, Search } from "lucide-react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { PublicOnlyRoute } from "../components/PublicOnlyRoute";
import { useAuth } from "../hooks/useAuth";
import { AccountSettingsPage } from "../pages/AccountSettingsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { EventGalleryPage } from "../pages/EventGalleryPage";
import { EventPeoplePage } from "../pages/EventPeoplePage";
import { EventSettingsPage } from "../pages/EventSettingsPage";
import { JoinEventPage } from "../pages/JoinEventPage";
import { LandingPage } from "../pages/LandingPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PublicGalleryPage } from "../pages/PublicGalleryPage";
import { SignupPage } from "../pages/SignupPage";

function AppLayout() {
  return (
    <div className="min-h-screen bg-soft-radial">
      <Navbar />
      <main>
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs uppercase tracking-[0.24em] text-slate/70 sm:px-6">
        PictureMe keeps every event gallery one tap away.
      </footer>
    </div>
  );
}

function HomeRoute() {
  const { loading, session } = useAuth();

  if (session) {
    return <Navigate replace to="/dashboard" />;
  }

  if (loading) {
    return null;
  }

  return <LandingPage />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route element={<AppLayout />}>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route path="/join/:token" element={<JoinEventPage />} />
        <Route path="/gallery/:token" element={<PublicGalleryPage />} />
        <Route path="/event-gallery/:token" element={<PublicGalleryPage mode="event" />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/event/:id" element={<EventGalleryPage />} />
          <Route path="/event/:id/people" element={<EventPeoplePage />} />
          <Route path="/event/:id/settings" element={<EventSettingsPage />} />
          <Route path="/account/settings" element={<AccountSettingsPage />} />
        </Route>
        <Route
          path="*"
          element={
            <NotFoundPage
              icon={<Search className="h-8 w-8" />}
              title="This page is out of frame"
              description="The link you opened does not exist or has moved."
              cta={{ label: "Back home", to: "/", icon: <Home className="h-4 w-4" /> }}
            />
          }
        />
      </Route>
    </Routes>
  );
}
