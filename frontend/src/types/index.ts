import type { Session } from "@supabase/supabase-js";

export type EventRole = "creator" | "admin" | "member";
export type EventStatus = "active" | "expired";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  hasFaceProfile: boolean;
  isDemo?: boolean;
}

export interface SessionState {
  session: Session | null;
  user: AuthUser | null;
  loading: boolean;
}

export interface EventSummary {
  id: string;
  name: string;
  date: string;
  coverUrl?: string;
  hostName?: string;
  photoCount: number;
  memberCount: number;
  memberPreviews: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
  }>;
  myPhotosCount?: number;
  daysRemaining: number;
  status: EventStatus;
  role: EventRole;
}

export interface EventDetail {
  id: string;
  name: string;
  description?: string;
  date: string;
  expiresAt: string;
  status: EventStatus;
  coverUrl?: string;
  joinToken: string;
  role: EventRole;
  creator: {
    id: string;
    name: string;
  };
  counts: {
    allPhotos: number;
    myPhotos: number;
    members: number;
  };
}

export interface JoinPreview {
  id: string;
  name: string;
  date: string;
  hostName: string;
  coverUrl?: string;
  photoCount: number;
  memberCount: number;
  status: EventStatus;
  expiresAt: string;
  joinToken: string;
  alreadyJoined?: boolean;
}

export interface PublicEventGalleryResponse {
  event: JoinPreview;
  photos: Photo[];
}

export interface Photo {
  id: string;
  cloudinaryUrl: string;
  thumbnailUrl?: string;
  originalFilename?: string;
  uploadedAt: string;
  faceCount: number;
}

export interface MatchedPhoto extends Photo {
  matchedAt?: string;
  similarityScore?: number;
}

export interface EventMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: EventRole;
  joinedAt: string;
  avatarUrl?: string;
}

export interface DashboardResponse {
  user: AuthUser;
  createdEvents: EventSummary[];
  joinedEvents: EventSummary[];
}

export interface AllPhotosResponse {
  photos: Photo[];
}

export interface MyPhotosResponse {
  photos: MatchedPhoto[];
  downloadAllUrl?: string;
  hasFaceProfile: boolean;
}

export interface GalleryResponse {
  event: {
    id: string;
    name: string;
    date: string;
  };
  sharedBy: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  photos: MatchedPhoto[];
  downloadAllUrl?: string;
}

export interface ShareGalleryTokenResponse {
  token: string;
  url: string;
}

export interface UploadJobProgress {
  jobId: string;
  eventId: string;
  totalFiles: number;
  uploadedFiles: number;
  indexedFiles: number;
  failedFiles: number;
  currentFileName?: string;
  status: "queued" | "uploading" | "indexing" | "completed" | "failed";
}

export interface FaceProfileStatus {
  hasFaceProfile: boolean;
  indexedAt?: string;
}

export interface AccountResponse {
  user: AuthUser & {
    faceIndexedAt?: string;
  };
}
