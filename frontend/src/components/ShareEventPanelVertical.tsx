import { Check, Copy, Download, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useMemo, useState } from "react";

interface ShareEventPanelVerticalProps {
  eventName: string;
  joinToken?: string;
  shareUrl?: string;
  linkLabel?: string;
  copyLabel?: string;
  copiedLabel?: string;
  downloadLabel?: string;
}

export function ShareEventPanelVertical({
  eventName,
  joinToken,
  shareUrl,
  linkLabel = "Link",
  copyLabel = "Copy link",
  copiedLabel = "Copied",
  downloadLabel = "Download QR",
}: ShareEventPanelVerticalProps) {
  const [copied, setCopied] = useState(false);

  const resolvedUrl = useMemo(() => {
    if (shareUrl) return shareUrl;
    if (!joinToken) return "";
    if (typeof window === "undefined") return `/join/${joinToken}`;
    return `${window.location.origin}/join/${joinToken}`;
  }, [joinToken, shareUrl]);

  const canvasId = `qr-v-${(joinToken ?? shareUrl ?? eventName).replace(/[^a-z0-9_-]/gi, "-")}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(resolvedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function handleDownloadQr() {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${eventName.toLowerCase().replace(/\s+/g, "-")}-qr.png`;
    link.click();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* QR code */}
      <div className="flex justify-center rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-ink/8">
        <QRCodeCanvas id={canvasId} value={resolvedUrl} size={160} includeMargin />
      </div>

      {/* Link display */}
      <div className="rounded-3xl bg-ivory/70 p-4">
        <div className="mb-2 flex items-center gap-2 text-ink">
          <QrCode className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">{linkLabel}</span>
        </div>
        <p className="break-all text-sm leading-5 text-slate">{resolvedUrl}</p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="primary-button flex-1"
          onClick={() => void handleCopy()}
        >
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? copiedLabel : copyLabel}
        </button>
        <button
          type="button"
          className="secondary-button flex-1"
          onClick={handleDownloadQr}
        >
          <Download className="mr-2 h-4 w-4" />
          {downloadLabel}
        </button>
      </div>
    </div>
  );
}
