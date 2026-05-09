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
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", token.apiKey);
  formData.append("timestamp", String(token.timestamp));
  formData.append("signature", token.signature);
  formData.append("folder", token.folder);
  formData.append("eager", token.eager);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${token.cloudName}/image/upload`,
    { method: "POST", body: formData },
  );

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
