import {
  AlertCircle,
  Images,
  MapPin,
  Settings,
  Share2,
  Sparkles,
  Upload,
  UserPlus,
  UserRoundSearch,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PhotoGrid } from "../components/PhotoGrid";
import { PhotoLightbox } from "../components/PhotoLightbox";
import { ShareModal } from "../components/ShareModal";
import { Spinner } from "../components/Spinner";
import { UploadModal } from "../components/UploadModal";
import { useAuth } from "../hooks/useAuth";
import { ApiError, apiFetch } from "../lib/api";
import { cn } from "../lib/cn";
import { formatDate } from "../lib/date";
import { normalizePhoto } from "../lib/normalizers";
import { supabase } from "../lib/supabase";
import type {
  AllPhotosResponse,
  EventDetail,
  EventPeopleResponse,
  EventPerson,
  MatchedPhoto,
  MyPhotosResponse,
  Photo,
  ShareGalleryTokenResponse,
} from "../types";

type LightboxSource = "my" | "all" | null;
type LoadDebugError = {
  message: string;
  status?: number;
  code?: string;
  path?: string;
  requestId?: string;
  details?: unknown;
  errorName?: string;
};

export function EventGalleryPage() {
  const { id = "" } = useParams();
  const { user, isDemo } = useAuth();
  const [searchParams] = useSearchParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [myPhotos, setMyPhotos] = useState<MatchedPhoto[]>([]);
  const [topUploaders, setTopUploaders] = useState<EventPerson[]>([]);
  const [hasFaceProfile, setHasFaceProfile] = useState(true);
  const [activeTab, setActiveTab] = useState<"my" | "all">("my");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadDebugError, setLoadDebugError] = useState<LoadDebugError | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [lightboxSource, setLightboxSource] = useState<LightboxSource>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [galleryShareUrl, setGalleryShareUrl] = useState<string | null>(null);
  const [galleryShareError, setGalleryShareError] = useState<string | null>(null);
  const [eventGalleryShareUrl, setEventGalleryShareUrl] = useState<string | null>(null);
  const [eventGalleryShareError, setEventGalleryShareError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    const response = await loadEventWithAccessRepair(id);
    setEvent(response);
  }, [id]);

  const loadAllPhotos = useCallback(async () => {
    try {
      const response = await apiFetch<AllPhotosResponse>(`/api/events/${id}/photos`);
      setAllPhotos(response.photos);
      setGalleryError(null);
    } catch (requestError) {
      setGalleryError(getGalleryLoadMessage(requestError));
    }
  }, [id]);

  const loadMyPhotos = useCallback(async () => {
    try {
      const response = await apiFetch<MyPhotosResponse>(`/api/events/${id}/my-photos`);
      setMyPhotos(response.photos);
      setHasFaceProfile(response.hasFaceProfile);
      setGalleryError(null);
    } catch (requestError) {
      setGalleryError(getGalleryLoadMessage(requestError));
    }
  }, [id]);

  const loadTopUploaders = useCallback(async () => {
    try {
      const response = await apiFetch<EventPeopleResponse>(`/api/events/${id}/people`);
      setTopUploaders(getTopUploaders(response.people));
    } catch {
      setTopUploaders([]);
    }
  }, [id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadDebugError(null);
    setGalleryError(null);

    try {
      const eventResponse = await loadEventWithAccessRepair(id);
      setEvent(eventResponse);
      const [allPhotosResult, myPhotosResult, peopleResult] = await Promise.allSettled([
        apiFetch<AllPhotosResponse>(`/api/events/${id}/photos`),
        apiFetch<MyPhotosResponse>(`/api/events/${id}/my-photos`),
        apiFetch<EventPeopleResponse>(`/api/events/${id}/people`),
      ]);
      const galleryMessages: string[] = [];

      if (allPhotosResult.status === "fulfilled") {
        setAllPhotos(allPhotosResult.value.photos);
      } else {
        setAllPhotos([]);
        galleryMessages.push(getGalleryLoadMessage(allPhotosResult.reason));
      }

      if (myPhotosResult.status === "fulfilled") {
        setMyPhotos(myPhotosResult.value.photos);
        setHasFaceProfile(myPhotosResult.value.hasFaceProfile);
      } else {
        setMyPhotos([]);
        setHasFaceProfile(true);
        galleryMessages.push(getGalleryLoadMessage(myPhotosResult.reason));
      }

      if (peopleResult.status === "fulfilled") {
        setTopUploaders(getTopUploaders(peopleResult.value.people));
      } else {
        setTopUploaders([]);
      }

      if (galleryMessages.length) {
        setGalleryError(galleryMessages[0]);
      }
    } catch (requestError) {
      setError(getEventLoadMessage(requestError, id));
      setLoadDebugError(getLoadDebugError(requestError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!id || isDemo) {
      return;
    }

    const photoChannel = supabase
      .channel(`photos-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "photos",
          filter: `event_id=eq.${id}`,
        },
        (payload) => {
          if (!payload.new) {
            return;
          }

          const incoming = normalizePhoto(payload.new as Record<string, unknown>);
          setAllPhotos((current) => {
            if (current.some((photo) => photo.id === incoming.id)) {
              return current;
            }
            return [incoming, ...current];
          });
          void loadEvent();
          void loadTopUploaders();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "photos",
          filter: `event_id=eq.${id}`,
        },
        (payload) => {
          const deletedId =
            typeof payload.old === "object" && payload.old && "id" in payload.old
              ? String(payload.old.id)
              : null;
          if (!deletedId) {
            return;
          }

          setAllPhotos((current) => current.filter((photo) => photo.id !== deletedId));
          setMyPhotos((current) => current.filter((photo) => photo.id !== deletedId));
          void loadEvent();
          void loadTopUploaders();
        },
      )
      .subscribe();

    const matchChannel = user
      ? supabase
          .channel(`matches-${user.id}-${id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "user_photo_matches",
              filter: `user_id=eq.${user.id}&event_id=eq.${id}`,
            },
            () => {
              void loadMyPhotos();
              void loadEvent();
              void loadTopUploaders();
            },
          )
          .subscribe()
      : null;

    return () => {
      void supabase.removeChannel(photoChannel);
      if (matchChannel) {
        void supabase.removeChannel(matchChannel);
      }
    };
  }, [id, isDemo, loadEvent, loadMyPhotos, loadTopUploaders, user]);

  const galleryPhotos = lightboxSource === "my" ? myPhotos : allPhotos;
  const showDenied = searchParams.get("denied") === "1";

  useEffect(() => {
    if (!id || !hasFaceProfile || myPhotos.length === 0 || galleryShareUrl) {
      return;
    }

    let cancelled = false;

    async function loadGalleryShareUrl() {
      try {
        if (!cancelled) {
          setGalleryShareError(null);
        }
        const response = await apiFetch<ShareGalleryTokenResponse>("/api/gallery-tokens", {
          method: "POST",
          body: { eventId: id },
        });
        if (!cancelled) {
          setGalleryShareUrl(response.url);
        }
      } catch (requestError) {
        if (!cancelled) {
          setGalleryShareError(
            requestError instanceof Error
              ? requestError.message
              : "PictureMe could not create a personal gallery share link.",
          );
        }
      }
    }

    void loadGalleryShareUrl();

    return () => {
      cancelled = true;
    };
  }, [galleryShareUrl, hasFaceProfile, id, myPhotos.length]);

  useEffect(() => {
    if (!id || !event || eventGalleryShareUrl) {
      return;
    }

    let cancelled = false;

    async function loadEventGalleryShareUrl() {
      try {
        if (!cancelled) {
          setEventGalleryShareError(null);
        }
        const response = await apiFetch<ShareGalleryTokenResponse>("/api/event-gallery-tokens", {
          method: "POST",
          body: { eventId: id },
        });
        if (!cancelled) {
          setEventGalleryShareUrl(response.url);
        }
      } catch (requestError) {
        if (!cancelled) {
          setEventGalleryShareError(
            requestError instanceof Error
              ? requestError.message
              : "PictureMe could not create a full gallery share link.",
          );
        }
      }
    }

    void loadEventGalleryShareUrl();

    return () => {
      cancelled = true;
    };
  }, [event, eventGalleryShareUrl, id]);

  async function handleDeletePhoto(photo: Photo) {
    const confirmed = window.confirm(
      `Delete ${photo.originalFilename ?? "this photo"} from the event gallery?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await apiFetch(`/api/events/${id}/photos/${photo.id}`, {
        method: "DELETE",
      });
      setAllPhotos((current) => current.filter((item) => item.id !== photo.id));
      setMyPhotos((current) => current.filter((item) => item.id !== photo.id));
      void loadEvent();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not delete this photo.",
      );
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading gallery..." />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="page-shell max-w-2xl">
        <div className="surface-card flex gap-3 p-6">
          <AlertCircle className="mt-1 h-5 w-5 text-red-600" />
          <div>
            <h1 className="text-2xl text-ink">Gallery unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate">
              {error ?? "PictureMe could not load this event."}
            </p>
            {loadDebugError ? <GalleryDebugDetails error={loadDebugError} /> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell space-y-5">
      {uploadOpen ? (
        <UploadModal
          eventId={id}
          onClose={() => setUploadOpen(false)}
          onCompleted={() => {
            void loadAll();
          }}
        />
      ) : null}

      {shareOpen ? (
        <ShareModal
          eventName={event.name}
          galleryShareUrl={galleryShareUrl}
          galleryShareError={galleryShareError}
          eventGalleryShareUrl={eventGalleryShareUrl}
          eventGalleryShareError={eventGalleryShareError}
          hasMyPhotos={myPhotos.length > 0}
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      {lightboxSource ? (
        <PhotoLightbox
          photos={galleryPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxSource(null)}
        />
      ) : null}

      {showDenied ? (
        <div className="rounded-3xl bg-amber-50 px-4 py-3 text-sm text-amber-600">
          Only event owners and admins can open event settings.
        </div>
      ) : null}

      {galleryError ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {galleryError}{" "}
          <button
            type="button"
            className="font-semibold text-ink underline underline-offset-4"
            onClick={() => void loadAll()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <section className="surface-card space-y-5 p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.62fr)] lg:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
              Event gallery
            </p>
            <h1 className="text-4xl text-ink">{event.name}</h1>
            <p className="mt-2 text-sm text-slate">{formatDate(event.date)}</p>
            {event.description ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate">
                {event.description}
              </p>
            ) : null}
            <p className="mt-3 flex items-center gap-2 text-sm text-slate">
              <MapPin className="h-4 w-4 text-seafoam-500" />
              {event.location || "TBD"}
            </p>
          </div>
          <div className="flex min-h-full flex-col gap-4 lg:items-end">
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link className="secondary-button" to={`/event/${id}/people`}>
                <UserPlus className="mr-2 h-4 w-4" />
                People
              </Link>
              {event.role === "creator" || event.role === "admin" ? (
                <Link className="secondary-button" to={`/event/${id}/settings`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Event settings
                </Link>
              ) : null}
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </button>
              {event.role === "creator" || event.role === "admin" || event.allowAnyoneUpload ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload photos
                </button>
              ) : null}
            </div>
            <TopUploadersPanel uploaders={topUploaders} />
          </div>
        </div>

        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="surface-card flex w-fit gap-2 p-2 shadow-none">
                <button
                  type="button"
                  className={cn(
                    "tab-pill",
                    activeTab === "my"
                      ? "bg-ink text-white"
                      : "text-slate hover:bg-ink/5",
                  )}
                  onClick={() => setActiveTab("my")}
                >
                  My Photos ({myPhotos.length})
                </button>
                <button
                  type="button"
                  className={cn(
                    "tab-pill",
                    activeTab === "all"
                      ? "bg-ink text-white"
                      : "text-slate hover:bg-ink/5",
                  )}
                  onClick={() => setActiveTab("all")}
                >
                  All Photos ({allPhotos.length})
                </button>
              </div>

              {activeTab === "my" ? (
                <div />
              ) : (
                <p className="text-sm text-slate">
                  {allPhotos.length} total photo{allPhotos.length === 1 ? "" : "s"}
                </p>
              )}
            </div>

            {activeTab === "my" ? (
              !hasFaceProfile ? (
                <EmptyState
                  icon={<UserRoundSearch className="h-7 w-7" />}
                  title="Complete your face profile"
                  description="Complete your face profile in Account Settings to see your photos automatically."
                  cta={{ label: "Open settings", to: "/account/settings" }}
                />
              ) : myPhotos.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-7 w-7" />}
                  title="No photos of you found yet"
                  description="Check back after more photos are uploaded, or share your gallery once matches appear."
                />
              ) : (
                <PhotoGrid
                  photos={myPhotos}
                  onSelect={(index) => {
                    setLightboxIndex(index);
                    setLightboxSource("my");
                  }}
                />
              )
            ) : allPhotos.length === 0 ? (
              <EmptyState
                icon={<Images className="h-7 w-7" />}
                title="No photos uploaded yet"
                description="Admins can upload event photos and this gallery will update in real time."
              />
            ) : (
              <PhotoGrid
                photos={allPhotos}
                canDelete={event.role === "creator" || event.role === "admin"}
                onDelete={(photo) => void handleDeletePhoto(photo)}
                onSelect={(index) => {
                  setLightboxIndex(index);
                  setLightboxSource("all");
                }}
              />
            )}
          </div>
      </section>
    </div>
  );
}

function TopUploadersPanel({ uploaders }: { uploaders: EventPerson[] }) {
  if (uploaders.length === 0) {
    return null;
  }

  const displayClass =
    uploaders.length === 1
      ? "mx-auto max-w-[240px]"
      : uploaders.length === 2
        ? "mx-auto grid-cols-2 max-w-[400px]"
        : "grid-cols-3";
  const avatarClass =
    uploaders.length === 1
      ? "h-20 w-20 text-xl lg:h-24 lg:w-24"
      : uploaders.length === 2
        ? "h-16 w-16 text-lg lg:h-20 lg:w-20"
        : "h-14 w-14 text-base lg:h-16 lg:w-16";

  return (
    <div className="w-full rounded-[28px] border border-seafoam-100 bg-ivory/70 p-5 lg:min-h-[154px] lg:max-w-[560px]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-seafoam-500">
          Top uploaders
        </p>
        <p className="text-xs text-slate">
          {uploaders.length === 1 ? "1 person" : `${uploaders.length} people`}
        </p>
      </div>
      <div className={cn("grid w-full items-center gap-4", displayClass)}>
        {uploaders.map((uploader, index) => (
          <div key={uploader.id} className="flex min-w-0 flex-col items-center text-center">
            <div
              className={cn(
                "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-seafoam-100 font-semibold text-ink ring-2 ring-white",
                avatarClass,
              )}
            >
              {uploader.avatarUrl ? (
                <img
                  src={uploader.avatarUrl}
                  alt={uploader.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{getInitials(uploader.name)}</span>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-white ring-2 ring-white">
                {index + 1}
              </span>
            </div>
            <p className="mt-2 w-full truncate text-sm font-semibold text-ink">
              {uploader.kind === "anonymous" ? `${uploader.name} (anonymous)` : uploader.name}
            </p>
            <p className="text-xs text-slate">
              {uploader.uploadCount} upload{uploader.uploadCount === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

async function loadEventWithAccessRepair(eventId: string) {
  try {
    return await apiFetch<EventDetail>(`/api/events/${eventId}`);
  } catch (requestError) {
    if (!isRecoverableEventAccessError(requestError)) {
      throw requestError;
    }

    await apiFetch(`/api/events/${eventId}/join`, { method: "POST" });
    return apiFetch<EventDetail>(`/api/events/${eventId}`);
  }
}

function isRecoverableEventAccessError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /do not have access|forbidden|event access/i.test(error.message);
}

function getGalleryLoadMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Some photos are unavailable because your gallery access could not be verified.";
    }
    if (error.status >= 500) {
      return "Some photos are unavailable because the gallery service had a problem.";
    }
    return "Some gallery photos could not load. Try refreshing the page.";
  }
  if (error instanceof Error && error.message) {
    return "Some gallery photos could not load because the browser could not reach the gallery service.";
  }
  return "Some gallery photos could not load. Try again.";
}

function getEventLoadMessage(error: unknown, eventId: string) {
  if (error instanceof ApiError) {
    const requestId = error.requestId ? ` Request reference: ${error.requestId}.` : "";
    if (error.status === 403) {
      return `You do not currently have access to this gallery. If you joined with a link or QR code, reopen that invite and try again.${requestId}`;
    }
    if (error.status === 404) {
      return `This gallery could not be found or is no longer available.${requestId}`;
    }
    return `PictureMe could not load this gallery right now. Try refreshing, then try the invite link again if this is a newly joined event.${requestId}`;
  }

  if (error instanceof Error && error.message) {
    return `PictureMe could not connect to the gallery service for event ${eventId}. Refresh the page, then try the invite link again if this is a newly joined event.`;
  }

  return `Event ${eventId} failed to load for an unknown reason.`;
}

function getLoadDebugError(error: unknown): LoadDebugError {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code,
      path: error.path,
      requestId: error.requestId,
      details: error.details,
      errorName: error.name,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      errorName: error.name,
    };
  }

  return { message: String(error) };
}

function GalleryDebugDetails({ error }: { error: LoadDebugError }) {
  const showDeveloperDetails = import.meta.env.DEV;

  return (
    <details className="mt-4 rounded-2xl border border-red-100 bg-red-50/60 p-4 text-xs text-red-900">
      <summary className="cursor-pointer font-semibold">Troubleshooting details</summary>
      <dl className="mt-3 space-y-2">
        <DebugRow label="request id" value={error.requestId} />
        <DebugRow label="status" value={getSafeStatusLabel(error.status)} />
        {showDeveloperDetails ? (
          <>
            <DebugRow label="message" value={error.message} />
            <DebugRow label="error" value={error.errorName} />
            <DebugRow label="path" value={error.path} />
            <DebugRow label="code" value={error.code} />
          </>
        ) : null}
        {showDeveloperDetails && typeof error.details !== "undefined" ? (
          <div>
            <dt className="font-semibold uppercase tracking-[0.18em]">details</dt>
            <dd className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white/70 p-2">
              {JSON.stringify(error.details, null, 2)}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

function getSafeStatusLabel(status?: number) {
  if (!status) {
    return undefined;
  }
  if (status === 401 || status === 403) {
    return "Access issue";
  }
  if (status === 404) {
    return "Not found";
  }
  if (status >= 500) {
    return "Service issue";
  }
  return "Request issue";
}

function DebugRow({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <dt className="font-semibold uppercase tracking-[0.18em]">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function getTopUploaders(people: EventPerson[]) {
  return [...people]
    .filter((person) => person.uploadCount > 0)
    .sort((a, b) => b.uploadCount - a.uploadCount || a.name.localeCompare(b.name))
    .slice(0, 3);
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "?";
}
