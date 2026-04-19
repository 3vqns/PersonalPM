import { Camera, CameraOff, RefreshCw } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import { cn } from "../lib/cn";

interface FaceScanCaptureProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  onCapture: (images: Blob[]) => Promise<void> | void;
  onSkip?: () => Promise<void> | void;
  submitLabel?: string;
}

const MIN_SELFIES = 3;
const MAX_SELFIES = 5;

export function FaceScanCapture({
  className,
  title = "Set up your face profile",
  description = "This lets PictureMe automatically find photos of you at any event you join.",
  onCapture,
  onSkip,
  submitLabel = "Finish face profile",
  ...rest
}: FaceScanCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const selfiesRef = useRef<Array<{ blob: Blob; previewUrl: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [selfies, setSelfies] = useState<Array<{ blob: Blob; previewUrl: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  const canCapture = useMemo(
    () => !loading && !cameraError && !capturedBlob && selfies.length < MAX_SELFIES,
    [cameraError, capturedBlob, loading, selfies.length],
  );
  const canSubmit = selfies.length >= MIN_SELFIES && !capturedBlob;

  async function startCamera() {
    setLoading(true);
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      setCameraError(
        error instanceof Error
          ? error.message
          : "PictureMe could not access your front-facing camera.",
      );
    } finally {
      setLoading(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    selfiesRef.current = selfies;
  }, [selfies]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      selfiesRef.current.forEach((selfie) => {
        URL.revokeObjectURL(selfie.previewUrl);
      });
    };
  }, []);

  async function handleTakePhoto() {
    if (!videoRef.current) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1024;
    canvas.height = videoRef.current.videoHeight || 1024;
    const context = canvas.getContext("2d");

    if (!context) {
      setCameraError("PictureMe could not capture a photo from the camera.");
      return;
    }

    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.95);
    });

    if (!blob) {
      setCameraError("PictureMe could not capture a photo from the camera.");
      return;
    }

    stopCamera();
    setCapturedBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function handleRetake() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setCapturedBlob(null);
    setPreviewUrl(null);
    await startCamera();
  }

  async function handleSaveSelfie() {
    if (!capturedBlob || !previewUrl) {
      return;
    }

    setSelfies((current) => [...current, { blob: capturedBlob, previewUrl }]);
    setCapturedBlob(null);
    setPreviewUrl(null);

    if (selfies.length + 1 < MAX_SELFIES) {
      await startCamera();
    }
  }

  function handleRemoveSelfie(index: number) {
    setSelfies((current) => {
      const next = [...current];
      const [removed] = next.splice(index, 1);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return next;
    });

    if (!streamRef.current && !capturedBlob) {
      void startCamera();
    }
  }

  async function handleConfirm() {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      await onCapture(selfies.map((selfie) => selfie.blob));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    if (!onSkip) {
      return;
    }

    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("surface-card space-y-5 p-5", className)} {...rest}>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
          Face profile
        </p>
        <h2 className="text-3xl text-ink">{title}</h2>
        <p className="text-sm leading-6 text-slate">{description}</p>
        <p className="text-sm font-medium text-ink">
          Capture {MIN_SELFIES} to {MAX_SELFIES} selfies. You have {selfies.length} ready.
        </p>
      </div>

      <div className="overflow-hidden rounded-[28px] bg-ink">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Face scan preview"
            className="aspect-[3/4] w-full object-cover"
          />
        ) : (
          <div className="relative aspect-[3/4] w-full">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
            />
            <div className="pointer-events-none absolute inset-6 rounded-[32px] border border-white/60" />
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-ink/30 text-white">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : null}
            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/80 px-6 text-center text-white">
                <CameraOff className="h-8 w-8" />
                <p className="text-sm leading-6">{cameraError}</p>
                <p className="text-xs uppercase tracking-[0.25em] text-white/60">
                  Camera access is required for face scan capture
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {selfies.length ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Enrollment set</p>
            <p className="text-xs uppercase tracking-[0.24em] text-slate/70">
              {selfies.length} of {MAX_SELFIES}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {selfies.map((selfie, index) => (
              <div key={selfie.previewUrl} className="space-y-2">
                <img
                  src={selfie.previewUrl}
                  alt={`Enrollment selfie ${index + 1}`}
                  className="aspect-[3/4] w-full rounded-2xl object-cover"
                />
                <button
                  type="button"
                  className="ghost-button w-full justify-center text-xs"
                  onClick={() => handleRemoveSelfie(index)}
                  disabled={submitting}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!capturedBlob ? (
          <>
            <button
              type="button"
              className="primary-button flex-1"
              onClick={() => void handleTakePhoto()}
              disabled={!canCapture || submitting}
            >
              <Camera className="mr-2 h-4 w-4" />
              {selfies.length ? "Capture another selfie" : "Take photo"}
            </button>
            <button
              type="button"
              className="secondary-button flex-1"
              onClick={() => void handleConfirm()}
              disabled={!canSubmit || submitting}
            >
              {submitLabel}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="secondary-button flex-1"
              onClick={() => void handleRetake()}
              disabled={submitting}
            >
              Retake
            </button>
            <button
              type="button"
              className="primary-button flex-1"
              onClick={() => void handleSaveSelfie()}
              disabled={submitting}
            >
              Save selfie
            </button>
          </>
        )}
      </div>

      {onSkip ? (
        <button
          type="button"
          className="ghost-button w-full justify-center"
          onClick={() => void handleSkip()}
          disabled={submitting}
        >
          Skip for now
        </button>
      ) : null}
    </div>
  );
}
