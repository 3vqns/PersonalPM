import { X } from "lucide-react";
import { useEffect } from "react";
import { ShareEventPanelVertical } from "./ShareEventPanelVertical";

interface ShareModalProps {
  eventName: string;
  joinToken: string;
  galleryShareUrl: string | null;
  galleryShareError: string | null;
  hasMyPhotos: boolean;
  onClose: () => void;
}

export function ShareModal({
  eventName,
  joinToken,
  galleryShareUrl,
  galleryShareError,
  hasMyPhotos,
  onClose,
}: ShareModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="surface-card relative w-full max-w-3xl space-y-6 p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
              Share
            </p>
            <h2 className="text-2xl text-ink">Share gallery</h2>
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

        {/* Two columns */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* ── Share My Photos ── */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
                My photos
              </p>
              <h3 className="text-lg text-ink">Share your matched photos</h3>
              <p className="mt-1 text-sm leading-5 text-slate">
                Anyone with this link can view only your matched photos — no account needed.
              </p>
            </div>

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
              // URL is actively being generated
              <div className="flex flex-col items-center gap-4 rounded-[28px] bg-ivory/70 p-5">
                <div className="h-[140px] w-[140px] animate-pulse rounded-2xl bg-ink/10" />
                <div className="w-full space-y-2">
                  <div className="h-2.5 w-3/4 rounded-full bg-ink/10" />
                  <div className="h-2.5 w-1/2 rounded-full bg-ink/10" />
                </div>
                <p className="text-xs text-slate">Generating your personal link…</p>
              </div>
            ) : (
              // User has no matched photos — nothing to share yet
              <div className="rounded-3xl border border-ink/10 bg-ivory/70 px-4 py-5 text-center">
                <p className="text-sm font-medium text-ink">No matched photos yet</p>
                <p className="mt-1 text-xs leading-5 text-slate">
                  Your personal gallery link will appear here once PictureMe finds photos of you in this event.
                </p>
              </div>
            )}
          </div>

          {/* ── Vertical divider (desktop) / horizontal divider (mobile) ── */}
          <div className="hidden sm:block absolute left-1/2 top-[7rem] bottom-8 w-px bg-ink/8 -translate-x-1/2" />
          <div className="block sm:hidden h-px w-full bg-ink/8" />

          {/* ── Share Full Gallery ── */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
                Full gallery
              </p>
              <h3 className="text-lg text-ink">Share the full event gallery</h3>
              <p className="mt-1 text-sm leading-5 text-slate">
                Anyone with this link can view all event photos — no account needed.
              </p>
            </div>
            <ShareEventPanelVertical
              eventName={eventName}
              joinToken={joinToken}
              linkLabel="Gallery link"
              copyLabel="Copy gallery link"
              downloadLabel="Download QR"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
