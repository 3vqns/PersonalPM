import { CheckCircle2, LoaderCircle, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { type CloudinaryUploadResult, uploadToCloudinary } from "../lib/cloudinaryUpload";
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
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
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

  function isSupportedUpload(file: File) {
    const lowerName = file.name.toLowerCase();
    return (
      file.type.startsWith("image/") ||
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed" ||
      lowerName.endsWith(".zip")
    );
  }

  function updateFiles(nextFiles: File[]) {
    setFiles(nextFiles.filter(isSupportedUpload));
    setError(null);
  }

  function isZipFile(file: File) {
    return (
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed" ||
      file.name.toLowerCase().endsWith(".zip")
    );
  }

  async function handleSubmit() {
    if (!files.length) {
      setError("Select at least one photo to upload.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const imageFiles = files.filter((f) => !isZipFile(f));
    const zipFiles = files.filter((f) => isZipFile(f));

    if (isDemo) {
      const demoFiles = files;
      const fakeJobId = `demo-${Date.now()}`;
      setJobId(fakeJobId);
      setProgress({
        jobId: fakeJobId,
        eventId,
        totalFiles: demoFiles.length,
        uploadedFiles: 0,
        indexedFiles: 0,
        failedFiles: 0,
        status: "queued",
      });
      demoFiles.forEach((file, index) => {
        window.setTimeout(() => {
          setProgress((current) => {
            if (!current) return current;
            const indexedFiles = index + 1;
            const completed = indexedFiles >= demoFiles.length;
            return {
              ...current,
              uploadedFiles: indexedFiles,
              indexedFiles,
              currentFileName: file.name,
              status: completed ? "completed" : "indexing",
            };
          });
          if (index + 1 >= demoFiles.length && !completedRef.current) {
            completedRef.current = true;
            setSubmitting(false);
            onCompleted?.();
          }
        }, 350 * (index + 1));
      });
      return;
    }

    try {
      let lastJobId: string | null = null;

      if (imageFiles.length > 0) {
        const token = await apiFetch<{
          cloudName: string;
          apiKey: string;
          timestamp: number;
          signature: string;
          folder: string;
          eager: string;
        }>(`/api/events/${eventId}/upload-token`, { method: "POST" });

        setUploadProgress({ current: 0, total: imageFiles.length });

        const uploaded: CloudinaryUploadResult[] = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const result = await uploadToCloudinary(imageFiles[i], token);
          uploaded.push(result);
          setUploadProgress({ current: i + 1, total: imageFiles.length });
        }

        setUploadProgress(null);

        const indexResponse = await apiFetch<{ jobId: string }>(
          `/api/events/${eventId}/photos/index`,
          { method: "POST", body: { photos: uploaded } },
        );
        lastJobId = indexResponse.jobId;
      }

      if (zipFiles.length > 0) {
        const formData = new FormData();
        zipFiles.forEach((f) => formData.append("photos", f));
        const zipResponse = await apiFetch<{ jobId: string }>(
          `/api/events/${eventId}/photos`,
          { method: "POST", body: formData },
        );
        lastJobId = zipResponse.jobId;
      }

      if (lastJobId) {
        setJobId(lastJobId);
      }
      setSubmitting(false);
      setFiles([]);
    } catch (requestError) {
      setSubmitting(false);
      setUploadProgress(null);
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
              Drag JPG, PNG, WebP, or ZIP files here
            </p>
            <p className="text-sm text-slate">
              Or tap to browse your camera roll, desktop, or a zipped batch
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.zip,application/zip,application/x-zip-compressed"
            multiple
            className="hidden"
            onChange={(event) => updateFiles(Array.from(event.target.files ?? []))}
          />
        </button>

        {files.length ? (
          <div className="rounded-3xl bg-ivory/70 p-4">
            <p className="font-medium text-ink">
              {files.length} file{files.length === 1 ? "" : "s"} ready
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate">
              {files.slice(0, 5).map((file) => (
                <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
              ))}
              {files.length > 5 ? <li>+ {files.length - 5} more</li> : null}
            </ul>
          </div>
        ) : null}

        {uploadProgress ? (
          <div className="space-y-3 rounded-3xl border border-ink/10 p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-ink">
                Uploading {uploadProgress.current} of {uploadProgress.total}{" "}
                {uploadProgress.total === 1 ? "photo" : "photos"}...
              </p>
              <span className="text-sm text-slate">
                {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-seafoam-500 transition-all"
                style={{
                  width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`,
                }}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-slate">
              <LoaderCircle className="h-4 w-4 animate-spin text-seafoam-500" />
              <span>Uploading directly to storage...</span>
            </div>
          </div>
        ) : null}

        {isDemo && progress ? (
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
              (isDemo && progress?.status === "completed") ||
              uploadStarted
            }
          >
            {isDemo && progress?.status === "completed"
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
