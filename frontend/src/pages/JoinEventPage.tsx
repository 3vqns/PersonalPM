import { AlertCircle, ArrowRight, CalendarDays, Images, Upload, Users } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { FaceScanCapture } from "../components/FaceScanCapture";
import { GoogleAuthButton } from "../components/GoogleAuthButton";
import { InlineAuthPanel } from "../components/InlineAuthPanel";
import { PhotoGrid } from "../components/PhotoGrid";
import { PhotoLightbox } from "../components/PhotoLightbox";
import { Spinner } from "../components/Spinner";
import { UploadModal } from "../components/UploadModal";
import { useAuth } from "../hooks/useAuth";
import { ApiError, apiFetch } from "../lib/api";
import { formatDate, formatLongDate } from "../lib/date";
import { submitFaceScan } from "../lib/faceScan";
import { supabase } from "../lib/supabase";
import type { EventJoinResponse, JoinPreview, PublicEventGalleryResponse } from "../types";

export function JoinEventPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { session, loading: authLoading, refreshSession } = useAuth();
  const autoJoinAttemptedRef = useRef(false);
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [publicGallery, setPublicGallery] = useState<PublicEventGalleryResponse | null>(null);
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
  const [debugError, setDebugError] = useState<ApiError | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<"idle" | "joining" | "joined" | "failed">("idle");
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Anonymous upload state
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [uploaderNameDraft, setUploaderNameDraft] = useState("");
  const [anonUploadOpen, setAnonUploadOpen] = useState(false);
  const [anonymousUploaderName, setAnonymousUploaderName] = useState("");

  useEffect(() => {
    autoJoinAttemptedRef.current = false;
    setRegistrationStatus("idle");
    setRegistrationError(null);
  }, [token]);

  useEffect(() => {
    async function loadPreview() {
      setLoading(true);
      try {
        const invitePreview = await apiFetch<JoinPreview>(`/api/events/join/${token}`, {
          auth: "optional",
        });
        setPreview(invitePreview);
        setPublicGallery(null);

        if (!invitePreview.privateGallery) {
          const response = await apiFetch<PublicEventGalleryResponse>(`/api/events/join/${token}/gallery`, {
            auth: "optional",
          });
          setPreview({
            ...response.event,
            alreadyJoined: invitePreview.alreadyJoined ?? response.event.alreadyJoined,
            galleryAccessStatus: invitePreview.galleryAccessStatus ?? response.event.galleryAccessStatus,
          });
          setPublicGallery(response);
        }
        setError(null);
        setDebugError(null);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "PictureMe could not load this event invite.",
        );
        setDebugError(requestError instanceof ApiError ? requestError : null);
      } finally {
        setLoading(false);
      }
    }

    void loadPreview();
  }, [token, session]);

  useEffect(() => {
    if (
      authLoading ||
      loading ||
      !session ||
      !preview ||
      preview.status !== "active" ||
      phase !== "auth" ||
      submitting ||
      autoJoinAttemptedRef.current
    ) {
      return;
    }

    autoJoinAttemptedRef.current = true;

    if (publicGallery) {
      if (preview.alreadyJoined) {
        setRegistrationStatus("joined");
        return;
      }

      setRegistrationStatus("joining");
      setRegistrationError(null);
      void apiFetch<EventJoinResponse>(`/api/events/${preview.id}/join`, {
        method: "POST",
      })
        .then((joinResponse) => {
          setRegistrationStatus("joined");
          setPreview((current) =>
            current && current.id === preview.id
              ? {
                  ...current,
                  alreadyJoined: true,
                  memberCount: joinResponse.alreadyJoined ? current.memberCount : current.memberCount + 1,
                }
              : current,
          );
        })
        .catch((requestError) => {
          autoJoinAttemptedRef.current = false;
          setRegistrationStatus("failed");
          setRegistrationError(
            requestError instanceof Error
              ? requestError.message
              : "PictureMe could not register you for this event.",
          );
          setDebugError(requestError instanceof ApiError ? requestError : null);
        });
      return;
    }

    if (preview.alreadyJoined) {
      navigate(`/event/${preview.id}`, { replace: true });
      return;
    }

    void (async () => {
      try {
        await handleJoin();
      } catch {
        autoJoinAttemptedRef.current = false;
      }
    })();
  }, [authLoading, loading, navigate, phase, preview, publicGallery, session, submitting]);

  async function handleJoin() {
    if (!preview) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiFetch(`/api/events/${preview.id}/join`, {
        method: "POST",
      });
      navigate(`/event/${preview.id}`, { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not join this event.",
      );
      setDebugError(requestError instanceof ApiError ? requestError : null);
      throw requestError;
    } finally {
      setSubmitting(false);
    }
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

  if (!preview) {
    return (
      <div className="page-shell max-w-2xl">
        <div className="surface-card flex gap-3 p-6">
          <AlertCircle className="mt-1 h-5 w-5 text-red-600" />
          <div>
            <h1 className="text-2xl text-ink">Invite unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate">
              {error ?? "This invite link is no longer available."}
            </p>
            {debugError ? <InviteDebugDetails error={debugError} /> : null}
          </div>
        </div>
      </div>
    );
  }

  // Public gallery invite view: full-width layout with registration handled separately.
  if (publicGallery) {
    const allowUpload = Boolean(preview.allowAnyoneUpload);

    function handleAnonUploadClick() {
      setUploaderNameDraft("");
      setNamePromptOpen(true);
    }

    function handleUploadClick() {
      if (session) {
        setAnonymousUploaderName("");
        setAnonUploadOpen(true);
        return;
      }

      handleAnonUploadClick();
    }

    function handleNamePromptSubmit(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const trimmed = uploaderNameDraft.trim();
      if (!trimmed) return;
      setAnonymousUploaderName(trimmed);
      setNamePromptOpen(false);
      setAnonUploadOpen(true);
    }

    return (
      <div className="page-shell space-y-4">
        {lightboxIndex !== null ? (
          <PhotoLightbox
            photos={publicGallery.photos}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        ) : null}

        {/* Name-prompt modal */}
        {namePromptOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setNamePromptOpen(false);
            }}
          >
            <div className="surface-card w-full max-w-sm space-y-5 p-6">
              <div>
                <h2 className="text-xl text-ink">What&apos;s your name?</h2>
                <p className="mt-1 text-sm text-slate">
                  We&apos;ll attach your name to the photos you upload.
                </p>
              </div>
              <form className="space-y-4" onSubmit={handleNamePromptSubmit}>
                <div className="field-shell">
                  <input
                    className="field-input"
                    placeholder="Jordan Lee"
                    value={uploaderNameDraft}
                    maxLength={50}
                    required
                    autoFocus
                    onChange={(e) => setUploaderNameDraft(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="secondary-button flex-1"
                    onClick={() => setNamePromptOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-button flex-1"
                    disabled={!uploaderNameDraft.trim()}
                  >
                    Continue to Upload
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {/* Anonymous upload modal */}
        {anonUploadOpen ? (
          <UploadModal
            eventId={preview.id}
            uploaderName={anonymousUploaderName}
            onClose={() => setAnonUploadOpen(false)}
            onCompleted={() => {
              setAnonUploadOpen(false);
              // Refresh the gallery after anonymous upload
              void apiFetch<typeof publicGallery>(
                `/api/events/join/${token}/gallery`,
                { auth: false },
              ).then((refreshed) => {
                setPublicGallery(refreshed);
              });
            }}
          />
        ) : null}

        {!session ? (
          <div className="rounded-[28px] bg-seafoam-50 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-seafoam-700">
              Sign in to see photos of yourself matched by face recognition.
            </p>
            <Link
              to="/login"
              className="secondary-button shrink-0 !text-seafoam-700 border-seafoam-200"
              onClick={() => {
                const returnPath = window.location.pathname + window.location.search;
                localStorage.setItem("returnTo", returnPath);
              }}
            >
              Sign in
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        ) : null}

        {session ? (
          <div className="rounded-[28px] bg-ivory/70 px-5 py-3 text-sm text-slate">
            {registrationStatus === "joining" ? "Registering you for this event..." : null}
            {registrationStatus === "joined" ? "You are registered for this event." : null}
            {registrationStatus === "failed" ? (
              <div className="space-y-2">
                <p className="text-red-600">
                  {registrationError ?? "PictureMe could not register you for this event."}
                </p>
                {debugError ? <InviteDebugDetails error={debugError} /> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="surface-card space-y-5 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
                Event gallery
              </p>
              <h1 className="text-4xl text-ink">{preview.name}</h1>
              <p className="text-sm text-slate">
                Hosted by {preview.hostName} on {formatLongDate(preview.date)}
              </p>
            </div>
            {allowUpload ? (
              <button
                type="button"
                className="primary-button shrink-0"
                onClick={handleUploadClick}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload photos
              </button>
            ) : null}
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

          {publicGallery.photos.length ? (
            <PhotoGrid
              photos={publicGallery.photos}
              onSelect={(index) => setLightboxIndex(index)}
            />
          ) : (
            <EmptyState
              icon={<Images className="h-7 w-7" />}
              title="No photos uploaded yet"
              description="This public gallery is live, but there are no event photos available right now."
            />
          )}
        </section>
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
                  {submitting
                    ? "Adding you to this event now..."
                    : "You&apos;re signed in. PictureMe will add you to this event automatically."}
                </p>
                <button
                  type="button"
                  className="primary-button w-full"
                  onClick={() =>
                    void (preview.alreadyJoined
                      ? navigate(`/event/${preview.id}`)
                      : handleJoin())
                  }
                  disabled={submitting}
                >
                  {preview.alreadyJoined
                    ? "Opening gallery"
                    : submitting
                      ? "Joining event..."
                      : "Join event"}
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

function InviteDebugDetails({ error }: { error: ApiError }) {
  const debugLines = [
    `path: ${error.path}`,
    `status: ${error.status}`,
    error.code ? `code: ${error.code}` : null,
    error.requestId ? `request id: ${error.requestId}` : null,
    error.details ? `details: ${JSON.stringify(error.details)}` : null,
  ].filter(Boolean);

  return (
    <details className="mt-4 rounded-2xl bg-ivory/70 p-3 text-xs text-slate">
      <summary className="cursor-pointer font-semibold text-ink">
        Debug details
      </summary>
      <pre className="mt-2 whitespace-pre-wrap font-mono leading-5">
        {debugLines.join("\n")}
      </pre>
    </details>
  );
}
