import { ArrowLeft, Images, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ShareEventPanelVertical } from "./ShareEventPanelVertical";

type ShareOption = "my" | "full";

interface ShareModalProps {
  eventName: string;
  galleryShareUrl: string | null;
  galleryShareError: string | null;
  eventGalleryShareUrl: string | null;
  eventGalleryShareError: string | null;
  hasMyPhotos: boolean;
  onClose: () => void;
}

export function ShareModal({
  eventName,
  galleryShareUrl,
  galleryShareError,
  eventGalleryShareUrl,
  eventGalleryShareError,
  hasMyPhotos,
  onClose,
}: ShareModalProps) {
  const [selected, setSelected] = useState<ShareOption | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selected) {
          setSelected(null);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, selected]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="surface-card relative my-auto w-full max-w-md space-y-6 p-6 sm:max-w-lg sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {selected ? (
              <button
                type="button"
                aria-label="Back to share options"
                className="secondary-button !px-3 !py-3"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
                Share
              </p>
              <h2 className="text-2xl text-ink">
                {selected === "my"
                  ? "Share your photos"
                  : selected === "full"
                    ? "Share full gallery"
                    : "Share gallery"}
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close share modal"
            className="secondary-button !px-3 !py-3"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-ink/8" />

        {/* Step 1 — Picker */}
        {selected === null ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="flex flex-col items-start gap-3 rounded-[28px] border border-ink/10 bg-ivory/60 p-5 text-left transition hover:border-seafoam-400 hover:bg-seafoam-50 active:scale-[0.98]"
              onClick={() => setSelected("my")}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-seafoam-100 text-seafoam-600">
                <User className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
                  My photos
                </p>
                <h3 className="mt-0.5 text-base font-semibold text-ink">Share My Photos</h3>
                <p className="mt-1 text-sm leading-5 text-slate">
                  Share only your matched photos — no account needed.
                </p>
              </div>
            </button>

            <button
              type="button"
              className="flex flex-col items-start gap-3 rounded-[28px] border border-ink/10 bg-ivory/60 p-5 text-left transition hover:border-seafoam-400 hover:bg-seafoam-50 active:scale-[0.98]"
              onClick={() => setSelected("full")}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-seafoam-100 text-seafoam-600">
                <Images className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
                  Full gallery
                </p>
                <h3 className="mt-0.5 text-base font-semibold text-ink">Share Full Gallery</h3>
                <p className="mt-1 text-sm leading-5 text-slate">
                  Share all event photos — no account needed.
                </p>
              </div>
            </button>
          </div>
        ) : selected === "my" ? (
          /* Step 2 — My Photos */
          <div className="space-y-4">
            <p className="text-sm leading-5 text-slate">
              Anyone with this link can view only your matched photos — no account needed.
            </p>
            {galleryShareUrl ? (
              <ShareEventPanelVertical
                eventName={eventName}
                shareUrl={galleryShareUrl}
                linkLabel="Gallery link"
                copyLabel="Copy gallery link"
                downloadLabel="Download QR"
              />
            ) : galleryShareError ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {galleryShareError}
              </div>
            ) : hasMyPhotos ? (
              <div className="flex flex-col items-center gap-4 rounded-[28px] bg-ivory/70 p-5">
                <div className="h-[140px] w-[140px] animate-pulse rounded-2xl bg-ink/10" />
                <div className="w-full space-y-2">
                  <div className="h-2.5 w-3/4 rounded-full bg-ink/10" />
                  <div className="h-2.5 w-1/2 rounded-full bg-ink/10" />
                </div>
                <p className="text-xs text-slate">Generating your personal link…</p>
              </div>
            ) : (
              <div className="rounded-3xl border border-ink/10 bg-ivory/70 px-4 py-5 text-center">
                <p className="text-sm font-medium text-ink">No matched photos yet</p>
                <p className="mt-1 text-xs leading-5 text-slate">
                  Your personal gallery link will appear here once PictureMe finds photos of you in
                  this event.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Step 2 — Full Gallery */
          <div className="space-y-4">
            <p className="text-sm leading-5 text-slate">
              Anyone with this link can view all event photos — no account needed.
            </p>
            {eventGalleryShareUrl ? (
              <ShareEventPanelVertical
                eventName={eventName}
                shareUrl={eventGalleryShareUrl}
                linkLabel="Gallery link"
                copyLabel="Copy gallery link"
                downloadLabel="Download QR"
              />
            ) : eventGalleryShareError ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {eventGalleryShareError}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-[28px] bg-ivory/70 p-5">
                <div className="h-[140px] w-[140px] animate-pulse rounded-2xl bg-ink/10" />
                <div className="w-full space-y-2">
                  <div className="h-2.5 w-3/4 rounded-full bg-ink/10" />
                  <div className="h-2.5 w-1/2 rounded-full bg-ink/10" />
                </div>
                <p className="text-xs text-slate">Generating full gallery link…</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
