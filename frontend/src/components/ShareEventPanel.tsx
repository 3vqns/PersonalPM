import { Check, Copy, Download, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useMemo, useState } from "react";

interface ShareEventPanelProps {
  eventName: string;
  joinToken?: string;
  shareUrl?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  linkLabel?: string;
  copyLabel?: string;
  copiedLabel?: string;
  downloadLabel?: string;
}

export function ShareEventPanel({
  eventName,
  joinToken,
  shareUrl,
  eyebrow = "Invite guests",
  title = "Share this event instantly",
  description = "Scan the QR code or send the join link to bring guests directly into PictureMe.",
  linkLabel = "Join link",
  copyLabel = "Copy join link",
  copiedLabel = "Copied",
  downloadLabel = "Download QR",
}: ShareEventPanelProps) {
  const [copied, setCopied] = useState(false);
  const resolvedUrl = useMemo(() => {
    if (shareUrl) {
      return shareUrl;
    }

    if (!joinToken) {
      return "";
    }

    if (typeof window === "undefined") {
      return `/join/${joinToken}`;
    }

    return `${window.location.origin}/join/${joinToken}`;
  }, [joinToken, shareUrl]);

  const canvasId = `qr-${(joinToken ?? shareUrl ?? eventName).replace(/[^a-z0-9_-]/gi, "-")}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(resolvedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function handleDownloadQr() {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${eventName.toLowerCase().replace(/\s+/g, "-")}-qr.png`;
    link.click();
  }

  return (
    <div className="surface-card grid gap-6 p-5 sm:grid-cols-[auto,1fr] sm:items-center">
      <div className="flex justify-center rounded-[28px] bg-white p-4">
        <QRCodeCanvas id={canvasId} value={resolvedUrl} size={180} includeMargin />
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            {eyebrow}
          </p>
          <h3 className="text-2xl text-ink">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate">
            {description}
          </p>
        </div>
        <div className="rounded-3xl bg-ivory/70 p-4 text-sm text-slate">
          <div className="mb-2 flex items-center gap-2 text-ink">
            <QrCode className="h-4 w-4" />
            <span className="font-medium">{linkLabel}</span>
          </div>
          <p className="break-all">{resolvedUrl}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="primary-button" onClick={() => void handleCopy()}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? copiedLabel : copyLabel}
          </button>
          <button type="button" className="secondary-button" onClick={handleDownloadQr}>
            <Download className="mr-2 h-4 w-4" />
            {downloadLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
