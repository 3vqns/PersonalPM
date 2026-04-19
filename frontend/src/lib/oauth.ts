import { supabase } from "./supabase";

export async function signInWithGoogleOAuth(redirectPath?: string) {
  const redirectUrl = new URL("https://personal-pm-frontend-one.vercel.app");
  redirectUrl.pathname = redirectPath && redirectPath.startsWith("/")
    ? redirectPath
    : window.location.pathname;
  redirectUrl.search = redirectPath?.startsWith("/")
    ? ""
    : window.location.search;
  redirectUrl.hash = "";

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl.toString(),
    },
  });

  if (error) {
    throw error;
  }
}
