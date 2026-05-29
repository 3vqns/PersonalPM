import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const authSessionTimeoutMs = 8000;
let pendingSessionRequest: Promise<Session | null> | null = null;

export async function getCurrentSession() {
  if (!pendingSessionRequest) {
    pendingSessionRequest = withTimeout(
      supabase.auth.getSession().then(({ data }) => data.session),
      "Supabase auth session check timed out",
      authSessionTimeoutMs,
    ).finally(() => {
      pendingSessionRequest = null;
    });
  }

  return pendingSessionRequest;
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
