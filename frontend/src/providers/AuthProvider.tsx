import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  disableDemoMode,
  enableDemoMode,
  getDemoSession,
  getDemoUser,
  isDemoMode,
} from "../lib/demo";
import { getCurrentSession } from "../lib/authSession";
import { apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { AccountResponse, AuthUser } from "../types";

interface AuthContextValue {
  session: Session | null;
  user: AuthUser | null;
  loading: boolean;
  authError: string | null;
  isDemo: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  startDemo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function mapUser(user: User | null): AuthUser | null {
  if (!user || !user.email) {
    return null;
  }

  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email,
    name:
      metadata.name ??
      metadata.full_name ??
      user.email.split("@")[0] ??
      "PictureMe User",
    avatarUrl: metadata.avatar_url,
    hasFaceProfile: Boolean(metadata.has_face_profile),
  };
}

async function loadAuthUser(user: User | null) {
  if (!user) {
    return null;
  }

  const fallbackUser = mapUser(user);

  try {
    const response = await apiFetch<AccountResponse>("/api/account");
    return response.user;
  } catch {
    return fallbackUser;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [demo, setDemo] = useState(isDemoMode());

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemoMode()) {
        setDemo(true);
        setSession(getDemoSession());
        setUser(getDemoUser());
        setAuthError(null);
        return;
      }

      const activeSession = await getCurrentSession();
      setSession(activeSession);
      setUser(await loadAuthUser(activeSession?.user ?? null));
      setDemo(false);
      setAuthError(null);
    } catch (authError) {
      console.error("PictureMe auth bootstrap failed", authError);
      setSession(null);
      setUser(null);
      setDemo(false);
      setAuthError(
        authError instanceof Error
          ? authError.message
          : "PictureMe could not check your session.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    disableDemoMode();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setDemo(false);
    setAuthError(null);
  }, []);

  const startDemo = useCallback(async () => {
    enableDemoMode();
    setDemo(true);
    setSession(getDemoSession());
    setUser(getDemoUser());
    setAuthError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, activeSession) => {
      if (isDemoMode()) {
        setDemo(true);
        setSession(getDemoSession());
        setUser(getDemoUser());
        setAuthError(null);
        setLoading(false);
        return;
      }

      setSession(activeSession);
      setUser(await loadAuthUser(activeSession?.user ?? null));
      setDemo(false);
      setAuthError(null);
      setLoading(false);

      if (event === 'SIGNED_IN') {
        const returnTo = localStorage.getItem('returnTo');
        if (returnTo) {
          localStorage.removeItem('returnTo');
          // Use navigate to redirect
          navigate(returnTo);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshSession]);

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      authError,
      isDemo: demo,
      signOut,
      refreshSession,
      startDemo,
    }),
    [authError, demo, loading, refreshSession, session, signOut, startDemo, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }

  return context;
}
