import { AlertCircle, Images } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PhotoGrid } from "../components/PhotoGrid";
import { PhotoLightbox } from "../components/PhotoLightbox";
import { Spinner } from "../components/Spinner";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/date";
import type { GalleryResponse } from "../types";

export function PublicGalleryPage() {
  const { token = "" } = useParams();
  const [gallery, setGallery] = useState<GalleryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    async function loadGallery() {
      setLoading(true);
      try {
        const response = await apiFetch<GalleryResponse>(`/api/gallery/${token}`, {
          auth: false,
        });
        setGallery(response);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "PictureMe could not load this shared gallery.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadGallery();
  }, [token]);

  if (loading) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading shared gallery..." />
      </div>
    );
  }

  if (error || !gallery) {
    return (
      <div className="page-shell max-w-2xl">
        <div className="surface-card flex gap-3 p-6">
          <AlertCircle className="mt-1 h-5 w-5 text-red-600" />
          <div>
            <h1 className="text-2xl text-ink">Shared gallery unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      {lightboxIndex !== null ? (
        <PhotoLightbox
          photos={gallery.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}

      <section className="surface-card space-y-5 p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            Shared gallery
          </p>
          <h1 className="text-4xl text-ink">{gallery.event.name}</h1>
          <p className="text-sm text-slate">
            {formatDate(gallery.event.date)} • Shared by {gallery.sharedBy.name}
          </p>
        </div>

        {gallery.photos.length ? (
          <PhotoGrid
            photos={gallery.photos}
            onSelect={(index) => setLightboxIndex(index)}
          />
        ) : (
          <EmptyState
            icon={<Images className="h-7 w-7" />}
            title="No shared photos yet"
            description="This public gallery link is active, but there are no matched photos available right now."
          />
        )}
      </section>
    </div>
  );
}
