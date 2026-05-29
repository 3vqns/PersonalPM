import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const authSessionTimeoutMs = 8000;
const sessionRefreshWindowSeconds = 60;
let pendingSessionRequest: Promise<Session | null> | null = null;

export async function getCurrentSession() {
  const cachedSession = readCachedSupabaseSession();
  if (cachedSession && !isSessionNearExpiry(cachedSession)) {
    return cachedSession;
  }

  if (!pendingSessionRequest) {
    pendingSessionRequest = withTimeout(
      supabase.auth.getSession().then(({ data }) => data.session),
      "Supabase auth session check timed out",
      authSessionTimeoutMs,
    )
      .catch((error) => {
        const fallbackSession = readCachedSupabaseSession();
        if (fallbackSession) {
          return fallbackSession;
        }

        throw error;
      })
      .finally(() => {
        pendingSessionRequest = null;
      });
  }

  return pendingSessionRequest;
}

export function readCachedSupabaseSession({
  allowExpired = false,
}: { allowExpired?: boolean } = {}) {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getSupabaseStorageKey();
  if (!storageKey) {
    return null;
  }

  try {
    const rawSession = window.localStorage.getItem(storageKey);
    if (!rawSession) {
      return null;
    }

    const session = parseStoredSession(JSON.parse(rawSession));
    if (!session) {
      return null;
    }

    if (!allowExpired && isSessionExpired(session)) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs: number) {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }
  });
}

function getSupabaseStorageKey() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    return null;
  }

  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function parseStoredSession(value: unknown): Session | null {
  if (isSessionLike(value)) {
    return value as Session;
  }

  if (isRecord(value) && isSessionLike(value.currentSession)) {
    return value.currentSession as Session;
  }

  return null;
}

function isSessionLike(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.access_token === "string" &&
    typeof value.refresh_token === "string" &&
    isRecord(value.user)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionExpired(session: Session) {
  return typeof session.expires_at === "number" && session.expires_at <= getCurrentTimeSeconds();
}

function isSessionNearExpiry(session: Session) {
  return (
    typeof session.expires_at === "number" &&
    session.expires_at - getCurrentTimeSeconds() <= sessionRefreshWindowSeconds
  );
}

function getCurrentTimeSeconds() {
  return Math.floor(Date.now() / 1000);
}
