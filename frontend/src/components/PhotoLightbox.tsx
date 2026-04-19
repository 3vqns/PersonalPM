import {
  ChevronLeft,
  ChevronRight,
  Download,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { buildPhotoDownloadName, downloadFile } from "../lib/download";
import type { Photo } from "../types";

interface PhotoLightboxProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}

export function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const currentPhoto = photos[index];

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowRight" && photos.length > 1) {
        setIndex((value) => (value + 1) % photos.length);
      }

      if (event.key === "ArrowLeft" && photos.length > 1) {
        setIndex((value) => (value - 1 + photos.length) % photos.length);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [onClose, photos.length]);

  if (!currentPhoto) {
    return null;
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(currentPhoto.cloudinaryUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function handleDownload() {
    try {
      setDownloading(true);
      await downloadFile(
        currentPhoto.cloudinaryUrl,
        buildPhotoDownloadName(currentPhoto.id, currentPhoto.originalFilename),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 p-4 text-white">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="ghost-button rounded-full bg-white/10 text-white"
          onClick={onClose}
        >
          <X className="mr-2 h-4 w-4" />
          Close
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="secondary-button border-white/20 bg-white/10 text-white"
            onClick={() => void handleCopyLink()}
          >
            <LinkIcon className="mr-2 h-4 w-4" />
            {copied ? "Copied" : "Share"}
          </button>
          <button
            type="button"
            className="secondary-button border-white/20 bg-white/10 text-white"
            onClick={() => void handleDownload()}
            disabled={downloading}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Downloading..." : "Download"}
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white"
              onClick={() => setIndex((value) => (value - 1 + photos.length) % photos.length)}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white"
              onClick={() => setIndex((value) => (value + 1) % photos.length)}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
        <img
          src={currentPhoto.cloudinaryUrl}
          alt="Full size event photo"
          className="max-h-[78vh] w-auto max-w-full rounded-3xl object-contain"
        />
      </div>

      <p className="text-center text-sm text-white/70">
        {index + 1} of {photos.length}
      </p>
    </div>
  );
}
