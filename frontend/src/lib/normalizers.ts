import type { Photo } from "../types";

export function normalizePhoto(record: Record<string, unknown>): Photo {
  return {
    id: readString(record, "id"),
    cloudinaryUrl:
      readString(record, "cloudinaryUrl") ||
      readString(record, "cloudinary_url") ||
      readString(record, "url"),
    thumbnailUrl:
      readOptionalString(record, "thumbnailUrl") ??
      readOptionalString(record, "thumbnail_url"),
    originalFilename:
      readOptionalString(record, "originalFilename") ??
      readOptionalString(record, "original_filename"),
    uploaderName:
      readOptionalString(record, "uploaderName") ??
      readOptionalString(record, "uploader_name"),
    uploaderIsAnonymous:
      readBoolean(record, "uploaderIsAnonymous") ??
      readBoolean(record, "uploader_is_anonymous"),
    uploadedAt:
      readString(record, "uploadedAt") ||
      readString(record, "uploaded_at") ||
      new Date().toISOString(),
    faceCount:
      readNumber(record, "faceCount") ?? readNumber(record, "face_count") ?? 0,
  };
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readOptionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}
