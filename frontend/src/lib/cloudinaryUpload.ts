export interface CloudinaryUploadToken {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  eager: string;
}

export interface CloudinaryUploadResult {
  publicId: string;
  originalFilename: string;
  cloudinaryUrl: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
}

export async function uploadToCloudinary(
  file: File,
  token: CloudinaryUploadToken,
): Promise<CloudinaryUploadResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 60000);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", token.apiKey);
  formData.append("timestamp", String(token.timestamp));
  formData.append("signature", token.signature);
  formData.append("folder", token.folder);
  formData.append("eager", token.eager);

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${token.cloudName}/image/upload`,
      { method: "POST", body: formData, signal: controller.signal },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Photo upload timed out. Try a smaller file or check your connection.");
    }
    throw new Error("PictureMe could not reach photo storage. Check your connection and try again.");
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = "Failed to upload photo to storage";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // use default message
    }
    throw new Error(message);
  }

  const data = (await response.json()) as {
    public_id: string;
    secure_url: string;
    eager?: Array<{ secure_url: string }>;
    width?: number;
    height?: number;
    bytes?: number;
    format?: string;
    original_filename?: string;
  };

  return {
    publicId: data.public_id,
    originalFilename: file.name,
    cloudinaryUrl: data.secure_url,
    thumbnailUrl: data.eager?.[0]?.secure_url ?? null,
    width: data.width ?? null,
    height: data.height ?? null,
    bytes: data.bytes ?? null,
    format: data.format ?? null,
  };
}
