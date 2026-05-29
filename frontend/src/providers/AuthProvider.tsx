import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { getCurrentSession, readCachedSupabaseSession } from "../lib/authSession";
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

interface AuthState {
  session: Session | null;
  user: AuthUser | null;
  loading: boolean;
  authError: string | null;
  demo: boolean;
}

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

function getInitialAuthState(): AuthState {
  if (isDemoMode()) {
    return {
      session: getDemoSession(),
      user: getDemoUser(),
      loading: false,
      authError: null,
      demo: true,
    };
  }

  const cachedSession = readCachedSupabaseSession();
  return {
    session: cachedSession,
    user: mapUser(cachedSession?.user ?? null),
    loading: !cachedSession,
    authError: null,
    demo: false,
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
  const [initialAuthState] = useState<AuthState>(() => getInitialAuthState());
  const [session, setSession] = useState<Session | null>(initialAuthState.session);
  const [user, setUser] = useState<AuthUser | null>(initialAuthState.user);
  const [loading, setLoading] = useState(initialAuthState.loading);
  const [authError, setAuthError] = useState<string | null>(
    initialAuthState.authError,
  );
  const [demo, setDemo] = useState(initialAuthState.demo);
  const sessionRef = useRef<Session | null>(initialAuthState.session);

  const setAuthState = useCallback(
    (nextSession: Session | null, nextUser: AuthUser | null, nextDemo: boolean) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      setUser(nextUser);
      setDemo(nextDemo);
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    const hadVisibleSession = Boolean(sessionRef.current);
    setLoading(!hadVisibleSession);
    try {
      if (isDemoMode()) {
        setAuthState(getDemoSession(), getDemoUser(), true);
        setAuthError(null);
        return;
      }

      const activeSession = await getCurrentSession();
      const activeUser = await loadAuthUser(activeSession?.user ?? null);
      setAuthState(activeSession, activeUser, false);
      setAuthError(null);
    } catch (authError) {
      console.error("PictureMe auth bootstrap failed", authError);
      if (!sessionRef.current) {
        setAuthState(null, null, false);
      }
      setAuthError(
        authError instanceof Error
          ? authError.message
          : "PictureMe could not check your session.",
      );
    } finally {
      setLoading(false);
    }
  }, [setAuthState]);

  const signOut = useCallback(async () => {
    disableDemoMode();
    await supabase.auth.signOut();
    setAuthState(null, null, false);
    setAuthError(null);
  }, [setAuthState]);

  const startDemo = useCallback(async () => {
    enableDemoMode();
    setAuthState(getDemoSession(), getDemoUser(), true);
    setAuthError(null);
    setLoading(false);
  }, [setAuthState]);

  useEffect(() => {
    void refreshSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, activeSession) => {
      if (isDemoMode()) {
        setAuthState(getDemoSession(), getDemoUser(), true);
        setAuthError(null);
        setLoading(false);
        return;
      }

      if (!activeSession && sessionRef.current && event !== "SIGNED_OUT") {
        setLoading(false);
        return;
      }

      if (event === "INITIAL_SESSION" && isSameSession(activeSession, sessionRef.current)) {
        setLoading(false);
        return;
      }

      const activeUser = await loadAuthUser(activeSession?.user ?? null);
      setAuthState(activeSession, activeUser, false);
      setAuthError(null);
      setLoading(false);

      if (event === "SIGNED_IN") {
        const returnTo = localStorage.getItem("returnTo");
        if (returnTo) {
          localStorage.removeItem("returnTo");
          navigate(returnTo);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, refreshSession, setAuthState]);

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

function isSameSession(firstSession: Session | null, secondSession: Session | null) {
  return (
    Boolean(firstSession?.access_token) &&
    firstSession?.access_token === secondSession?.access_token
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }

  return context;
}
