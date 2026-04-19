import { CheckCircle2, LoaderCircle, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/cn";
import type { UploadJobProgress } from "../types";
import { Modal } from "./Modal";

interface UploadModalProps {
  eventId: string;
  onClose: () => void;
  onCompleted?: () => void;
}

export function UploadModal({
  eventId,
  onClose,
  onCompleted,
}: UploadModalProps) {
  const { isDemo } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const completedRef = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadJobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadStarted = Boolean(jobId) && !isDemo && !error;

  const disableClose =
    submitting &&
    isDemo &&
    progress?.status !== "completed" &&
    progress?.status !== "failed";

  const progressPercent = useMemo(() => {
    if (!progress || progress.totalFiles === 0) {
      return 0;
    }

    return Math.min(
      100,
      Math.round(
        ((progress.indexedFiles + progress.failedFiles) / progress.totalFiles) * 100,
      ),
    );
  }, [progress]);

  function updateFiles(nextFiles: File[]) {
    setFiles(nextFiles.filter((file) => file.type.startsWith("image/")));
    setError(null);
  }

  async function handleSubmit() {
    if (!files.length) {
      setError("Select at least one photo to upload.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("photos", file);
    });

    try {
      const response = await apiFetch<{ jobId: string }>(
        `/api/events/${eventId}/photos`,
        {
          method: "POST",
          body: formData,
        },
      );

      setJobId(response.jobId);

      if (isDemo) {
        setProgress({
          jobId: response.jobId,
          eventId,
          totalFiles: files.length,
          uploadedFiles: 0,
          indexedFiles: 0,
          failedFiles: 0,
          status: "queued",
        });
        files.forEach((file, index) => {
          window.setTimeout(() => {
            setProgress((current) => {
              if (!current) {
                return current;
              }

              const indexedFiles = index + 1;
              const completed = indexedFiles >= files.length;

              return {
                ...current,
                uploadedFiles: indexedFiles,
                indexedFiles,
                currentFileName: file.name,
                status: completed ? "completed" : "indexing",
              };
            });

            if (index + 1 >= files.length && !completedRef.current) {
              completedRef.current = true;
              setSubmitting(false);
              onCompleted?.();
            }
          }, 350 * (index + 1));
        });
      } else {
        setSubmitting(false);
        setFiles([]);
      }
    } catch (requestError) {
      setSubmitting(false);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not upload these photos.",
      );
    }
  }

  return (
    <Modal
      title="Upload photos"
      onClose={onClose}
      disableClose={disableClose}
      className="sm:max-w-xl"
    >
      <div className="space-y-5">
        <button
          type="button"
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed px-5 py-10 text-center transition",
            dragActive
              ? "border-seafoam-400 bg-seafoam-50"
              : "border-ink/10 bg-ivory/60",
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            updateFiles(Array.from(event.dataTransfer.files));
          }}
          disabled={submitting}
        >
          <UploadCloud className="h-8 w-8 text-seafoam-500" />
          <div>
            <p className="font-medium text-ink">
              Drag JPG, PNG, or HEIC files here
            </p>
            <p className="text-sm text-slate">
              Or tap to browse your camera roll or desktop
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic"
            multiple
            className="hidden"
            onChange={(event) => updateFiles(Array.from(event.target.files ?? []))}
          />
        </button>

        {files.length ? (
          <div className="rounded-3xl bg-ivory/70 p-4">
            <p className="font-medium text-ink">
              {files.length} photo{files.length === 1 ? "" : "s"} ready
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate">
              {files.slice(0, 5).map((file) => (
                <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
              ))}
              {files.length > 5 ? <li>+ {files.length - 5} more</li> : null}
            </ul>
          </div>
        ) : null}

        {progress ? (
          <div className="space-y-3 rounded-3xl border border-ink/10 p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-ink">
                Indexing {progress.indexedFiles + progress.failedFiles} of{" "}
                {progress.totalFiles} photos...
              </p>
              <span className="text-sm text-slate">{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-seafoam-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-slate">
              {progress.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-seafoam-500" />
              ) : (
                <LoaderCircle className="h-4 w-4 animate-spin text-seafoam-500" />
              )}
              <span>
                {progress.currentFileName
                  ? `Working on ${progress.currentFileName}`
                  : "Waiting for the backend to stream progress..."}
              </span>
            </div>
          </div>
        ) : null}

        {uploadStarted ? (
          <div className="space-y-2 rounded-3xl border border-seafoam-200 bg-seafoam-50 p-4">
            <div className="flex items-center gap-2 text-seafoam-700">
              <CheckCircle2 className="h-4 w-4" />
              <p className="font-medium">Upload started</p>
            </div>
            <p className="text-sm text-slate">
              PictureMe is processing this batch in the background. New photos will
              appear automatically in the gallery as they finish indexing.
            </p>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="secondary-button flex-1"
            onClick={onClose}
            disabled={disableClose}
          >
            {progress?.status === "completed" || uploadStarted ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            className="primary-button flex-1"
            onClick={() => void handleSubmit()}
            disabled={
              submitting ||
              !files.length ||
              progress?.status === "completed" ||
              uploadStarted
            }
          >
            {progress?.status === "completed"
              ? "Indexed"
              : uploadStarted
                ? "Processing"
                : "Start upload"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
