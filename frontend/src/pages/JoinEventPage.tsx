import { AlertCircle, ArrowRight, CalendarDays, Images, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaceScanCapture } from "../components/FaceScanCapture";
import { GoogleAuthButton } from "../components/GoogleAuthButton";
import { InlineAuthPanel } from "../components/InlineAuthPanel";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { formatDate, formatLongDate } from "../lib/date";
import { submitFaceScan } from "../lib/faceScan";
import { supabase } from "../lib/supabase";
import type { JoinPreview } from "../types";

export function JoinEventPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { session, loading: authLoading, refreshSession } = useAuth();
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [phase, setPhase] = useState<"auth" | "face">("auth");
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPreview() {
      setLoading(true);
      try {
        const response = await apiFetch<JoinPreview>(`/api/events/join/${token}`, {
          auth: "optional",
        });
        setPreview(response);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "PictureMe could not load this event invite.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadPreview();
  }, [token, session]);

  async function handleJoin() {
    if (!preview) {
      return;
    }

    await apiFetch(`/api/events/${preview.id}/join`, {
      method: "POST",
    });
    navigate(`/event/${preview.id}`, { replace: true });
  }

  async function handleInlineSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: signupForm.email,
        password: signupForm.password,
        options: {
          data: { name: signupForm.name },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      await refreshSession();
      setPhase("face");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not create your account.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInlineLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });

      if (signInError) {
        throw signInError;
      }

      await refreshSession();
      await handleJoin();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not log you in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFaceCapture(images: Blob[]) {
    await submitFaceScan(images);
    await refreshSession();
    await handleJoin();
  }

  if (loading || authLoading) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading event invite..." />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="page-shell max-w-2xl">
        <div className="surface-card flex gap-3 p-6">
          <AlertCircle className="mt-1 h-5 w-5 text-red-600" />
          <div>
            <h1 className="text-2xl text-ink">Invite unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate">
              {error ?? "This invite link is no longer available."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <section className="surface-card overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[1.1fr,0.9fr]">
          <div className="min-h-72 bg-soft-radial">
            {preview.coverUrl ? (
              <img
                src={preview.coverUrl}
                alt={preview.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-72 items-center justify-center bg-gradient-to-br from-seafoam-100 via-white to-amber-50" />
            )}
          </div>
          <div className="space-y-6 p-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
                Event invite
              </p>
              <h1 className="text-4xl text-ink">{preview.name}</h1>
              <p className="text-sm text-slate">
                Hosted by {preview.hostName} on {formatLongDate(preview.date)}
              </p>
            </div>
            <div className="grid gap-3 rounded-[28px] bg-ivory/70 p-4 sm:grid-cols-3">
              <div className="flex items-center gap-2 text-sm text-slate">
                <CalendarDays className="h-4 w-4 text-seafoam-500" />
                <span>{formatDate(preview.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate">
                <Images className="h-4 w-4 text-seafoam-500" />
                <span>{preview.photoCount} photos</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate">
                <Users className="h-4 w-4 text-seafoam-500" />
                <span>{preview.memberCount} joined</span>
              </div>
            </div>

            {preview.status === "expired" ? (
              <div className="rounded-3xl bg-amber-50 px-4 py-3 text-sm text-amber-600">
                This gallery has expired and can no longer accept new members.
              </div>
            ) : phase === "face" ? (
              <FaceScanCapture
                onCapture={handleFaceCapture}
                onSkip={handleJoin}
                className="border border-ink/10 shadow-none"
              />
            ) : session ? (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-slate">
                  You&apos;re signed in. Join the event to open My Photos and the
                  full gallery.
                </p>
                <button
                  type="button"
                  className="primary-button w-full"
                  onClick={() => void (preview.alreadyJoined ? navigate(`/event/${preview.id}`) : handleJoin())}
                >
                  {preview.alreadyJoined ? "Go to gallery" : "Join event"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <InlineAuthPanel mode={mode} onModeChange={setMode} />

                <GoogleAuthButton
                  className="secondary-button w-full border-[#d9cdc1] bg-white"
                  label={
                    mode === "signup"
                      ? "Join with Google"
                      : "Continue with Google"
                  }
                  redirectPath={`/join/${token}`}
                  onError={setError}
                />

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-[#e6d9cb]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/70">
                    Or with email
                  </span>
                  <div className="h-px flex-1 bg-[#e6d9cb]" />
                </div>

                <form
                  className="space-y-4"
                  onSubmit={mode === "signup" ? handleInlineSignup : handleInlineLogin}
                >
                  {mode === "signup" ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-ink">Full name</span>
                      <div className="field-shell">
                        <input
                          className="field-input"
                          value={signupForm.name}
                          onChange={(event) =>
                            setSignupForm((value) => ({
                              ...value,
                              name: event.target.value,
                            }))
                          }
                          placeholder="Jordan Lee"
                          required
                        />
                      </div>
                    </label>
                  ) : null}

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-ink">Email</span>
                    <div className="field-shell">
                      <input
                        className="field-input"
                        type="email"
                        value={mode === "signup" ? signupForm.email : loginForm.email}
                        onChange={(event) =>
                          mode === "signup"
                            ? setSignupForm((value) => ({
                                ...value,
                                email: event.target.value,
                              }))
                            : setLoginForm((value) => ({
                                ...value,
                                email: event.target.value,
                              }))
                        }
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-ink">Password</span>
                    <div className="field-shell">
                      <input
                        className="field-input"
                        type="password"
                        value={mode === "signup" ? signupForm.password : loginForm.password}
                        onChange={(event) =>
                          mode === "signup"
                            ? setSignupForm((value) => ({
                                ...value,
                                password: event.target.value,
                              }))
                            : setLoginForm((value) => ({
                                ...value,
                                password: event.target.value,
                              }))
                        }
                        placeholder={
                          mode === "signup" ? "Create a password" : "Enter your password"
                        }
                        required
                      />
                    </div>
                  </label>

                  {error ? (
                    <div className="rounded-3xl bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    className="primary-button w-full"
                    disabled={submitting}
                  >
                    {submitting
                      ? mode === "signup"
                        ? "Creating account..."
                        : "Signing in..."
                      : mode === "signup"
                        ? "Create account"
                        : "Log in"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
