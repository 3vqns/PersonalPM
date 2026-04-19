import {
  AlertCircle,
  Images,
  Settings,
  Sparkles,
  Upload,
  UserRoundSearch,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ExpiryBanner } from "../components/ExpiryBanner";
import { PhotoGrid } from "../components/PhotoGrid";
import { PhotoLightbox } from "../components/PhotoLightbox";
import { ShareEventPanel } from "../components/ShareEventPanel";
import { Spinner } from "../components/Spinner";
import { UploadModal } from "../components/UploadModal";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/cn";
import { formatDate, getDaysRemaining } from "../lib/date";
import { normalizePhoto } from "../lib/normalizers";
import { supabase } from "../lib/supabase";
import type {
  AllPhotosResponse,
  EventDetail,
  MatchedPhoto,
  MyPhotosResponse,
  Photo,
  ShareGalleryTokenResponse,
} from "../types";

type LightboxSource = "my" | "all" | null;

export function EventGalleryPage() {
  const { id = "" } = useParams();
  const { user, isDemo } = useAuth();
  const [searchParams] = useSearchParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [myPhotos, setMyPhotos] = useState<MatchedPhoto[]>([]);
  const [hasFaceProfile, setHasFaceProfile] = useState(true);
  const [downloadAllUrl, setDownloadAllUrl] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<"my" | "all">("my");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxSource, setLightboxSource] = useState<LightboxSource>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [galleryShareUrl, setGalleryShareUrl] = useState<string | null>(null);
  const [galleryShareError, setGalleryShareError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    const response = await apiFetch<EventDetail>(`/api/events/${id}`);
    setEvent(response);
  }, [id]);

  const loadAllPhotos = useCallback(async () => {
    const response = await apiFetch<AllPhotosResponse>(`/api/events/${id}/photos`);
    setAllPhotos(response.photos);
  }, [id]);

  const loadMyPhotos = useCallback(async () => {
    const response = await apiFetch<MyPhotosResponse>(`/api/events/${id}/my-photos`);
    setMyPhotos(response.photos);
    setHasFaceProfile(response.hasFaceProfile);
    setDownloadAllUrl(response.downloadAllUrl);
  }, [id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([loadEvent(), loadAllPhotos(), loadMyPhotos()]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not load this gallery.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadAllPhotos, loadEvent, loadMyPhotos]);

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
  }, [id, isDemo, loadEvent, loadMyPhotos, user]);

  const daysRemaining = useMemo(
    () => (event ? getDaysRemaining(event.expiresAt) : 0),
    [event],
  );

  const galleryPhotos = lightboxSource === "my" ? myPhotos : allPhotos;
  const showCreatedPanel =
    searchParams.get("created") === "1" && event?.role === "creator";
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

      {lightboxSource ? (
        <PhotoLightbox
          photos={galleryPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxSource(null)}
        />
      ) : null}

      {showDenied ? (
        <div className="rounded-3xl bg-amber-50 px-4 py-3 text-sm text-amber-600">
          Only the event creator can open event settings.
        </div>
      ) : null}

      <section className="surface-card space-y-5 p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
              Event gallery
            </p>
            <h1 className="text-4xl text-ink">{event.name}</h1>
            <p className="mt-2 text-sm text-slate">{formatDate(event.date)}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {event.role === "creator" ? (
              <Link className="secondary-button" to={`/event/${id}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Event settings
              </Link>
            ) : null}
            {event.role === "creator" || event.role === "admin" ? (
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
        </div>

        <ExpiryBanner expiresAt={event.expiresAt} daysRemaining={daysRemaining} />

        {showCreatedPanel ? (
          <ShareEventPanel eventName={event.name} joinToken={event.joinToken} />
        ) : null}

        {event.status === "expired" ? (
          <div className="rounded-[28px] bg-amber-50 px-5 py-6 text-sm leading-6 text-amber-600">
            This gallery has expired. Photos were deleted after 30 days.
          </div>
        ) : (
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
                <div className="flex flex-col gap-3 sm:flex-row">
                  {downloadAllUrl ? (
                    <a
                      className="primary-button"
                      href={downloadAllUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download all
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate">
                  {allPhotos.length} total photo{allPhotos.length === 1 ? "" : "s"}
                </p>
              )}
            </div>

            {activeTab === "my" && myPhotos.length > 0 ? (
              galleryShareUrl ? (
                <ShareEventPanel
                  eventName={event.name}
                  shareUrl={galleryShareUrl}
                  eyebrow="Share gallery"
                  title="Share your photos instantly"
                  description="Scan the QR code or send the gallery link so anyone can view only your matched photos without creating an account."
                  linkLabel="Gallery link"
                  copyLabel="Copy gallery link"
                  downloadLabel="Download gallery QR"
                />
              ) : galleryShareError ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {galleryShareError}
                </div>
              ) : null
            ) : null}

            {activeTab === "all" ? (
              <ShareEventPanel
                eventName={event.name}
                joinToken={event.joinToken}
                eyebrow="Share gallery"
                title="Share the full event gallery"
                description="Scan the QR code or send the gallery link so anyone can view all event photos without creating an account."
                linkLabel="Gallery link"
                copyLabel="Copy gallery link"
                downloadLabel="Download gallery QR"
              />
            ) : null}

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
        )}
      </section>
    </div>
  );
}
