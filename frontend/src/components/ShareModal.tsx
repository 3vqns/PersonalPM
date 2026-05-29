import { X } from "lucide-react";
import { useEffect } from "react";
import { ShareEventPanel } from "./ShareEventPanel";

interface ShareModalProps {
  eventName: string;
  joinToken: string;
  galleryShareUrl: string | null;
  galleryShareError: string | null;
  onClose: () => void;
}

export function ShareModal({
  eventName,
  joinToken,
  galleryShareUrl,
  galleryShareError,
  onClose,
}: ShareModalProps) {
  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal panel */}
      <div className="surface-card relative w-full max-w-4xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
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

        {/* Two columns */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Share My Photos */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Share My Photos</p>
            {galleryShareUrl ? (
              <ShareEventPanel
                eventName={eventName}
                shareUrl={galleryShareUrl}
                eyebrow="My photos"
                title="Share your matched photos"
                description="Anyone with this link can view only your matched photos — no account needed."
                linkLabel="Gallery link"
                copyLabel="Copy gallery link"
                downloadLabel="Download QR"
              />
            ) : galleryShareError ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {galleryShareError}
              </div>
            ) : (
              <div className="surface-card flex items-center gap-3 p-5 opacity-60">
                <div className="h-[180px] w-[180px] animate-pulse rounded-[28px] bg-ink/10" />
                <div className="flex-1 space-y-3">
                  <div className="h-3 w-2/3 rounded-full bg-ink/10" />
                  <div className="h-3 w-1/2 rounded-full bg-ink/10" />
                  <p className="text-xs text-slate">
                    Generating your personal link…
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Share Full Gallery */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">Share Full Gallery</p>
            <ShareEventPanel
              eventName={eventName}
              joinToken={joinToken}
              eyebrow="Full gallery"
              title="Share the full event gallery"
              description="Anyone with this link can view all event photos — no account needed."
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
