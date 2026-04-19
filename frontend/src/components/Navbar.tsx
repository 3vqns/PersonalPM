import {
  Bell,
  Camera,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { getInitials } from "../lib/date";
import { cn } from "../lib/cn";
import { useAuth } from "../hooks/useAuth";

export function Navbar() {
  const navigate = useNavigate();
  const { user, session, signOut, isDemo, startDemo } = useAuth();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/60 bg-ivory/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-white shadow-card">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-ink">PictureMe</p>
            <p className="text-xs uppercase tracking-[0.28em] text-slate">
              AI event photos
            </p>
          </div>
        </Link>

        {session && user ? (
          <div className="relative">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Notifications"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 bg-white text-ink"
              >
                <Bell className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="flex items-center gap-3 rounded-full border border-ink/10 bg-white px-2 py-2"
                onClick={() => setOpen((value) => !value)}
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-seafoam-100 font-semibold text-seafoam-600">
                    {getInitials(user.name)}
                  </div>
                )}
                <div className="hidden text-left sm:block">
                  <p className="max-w-32 truncate text-sm font-medium text-ink">
                    {user.name}
                  </p>
                  <p className="max-w-32 truncate text-xs text-slate">
                    {isDemo ? "Demo account" : user.email}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-slate" />
              </button>
            </div>

            {open ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] w-56 rounded-3xl border border-ink/10 bg-white p-2 shadow-card">
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate transition hover:bg-ivory/80",
                      isActive && "bg-ivory text-ink",
                    )
                  }
                  onClick={() => setOpen(false)}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </NavLink>
                <NavLink
                  to="/account/settings"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate transition hover:bg-ivory/80",
                      isActive && "bg-ivory text-ink",
                    )
                  }
                  onClick={() => setOpen(false)}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </NavLink>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-slate transition hover:bg-ivory/80"
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="ghost-button"
              onClick={() => void startDemo().then(() => navigate("/dashboard"))}
            >
              Demo
            </button>
            <Link className="ghost-button" to="/login">
              Log in
            </Link>
            <Link className="primary-button" to="/signup">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
