export async function downloadFile(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("PictureMe could not download this file.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function buildPhotoDownloadName(photoId: string, originalFilename?: string | null) {
  if (originalFilename && originalFilename.trim()) {
    return originalFilename;
  }

  return `pictureme-photo-${photoId}.jpg`;
}
