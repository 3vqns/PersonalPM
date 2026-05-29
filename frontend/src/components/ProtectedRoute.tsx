import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { buildRedirectParam } from "../lib/redirect";
import { useAuth } from "../hooks/useAuth";
import { Spinner } from "./Spinner";

interface ProtectedRouteProps {
  children?: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { authError, loading, refreshSession, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <Spinner label="Checking your session..." />
      </div>
    );
  }

  if (authError && !session) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <div className="surface-card max-w-md space-y-4 p-6 text-center">
          <div>
            <h1 className="text-2xl text-ink">Session check failed</h1>
            <p className="mt-2 text-sm leading-6 text-slate">
              PictureMe could not confirm your session. Try again before signing in again.
            </p>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => void refreshSession()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        replace
        to={buildRedirectParam(location.pathname, location.search, location.hash)}
      />
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
