import { apiFetch } from "./api";
import type { FaceProfileStatus } from "../types";

export function submitFaceScan(images: Blob[]) {
  const formData = new FormData();
  images.forEach((image, index) => {
    formData.append("selfies", image, `face-scan-${index + 1}.jpg`);
  });

  return apiFetch<FaceProfileStatus>("/api/account/face-profile", {
    method: "POST",
    body: formData,
  });
}
