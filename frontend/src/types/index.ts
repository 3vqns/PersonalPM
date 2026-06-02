import type { Session } from "@supabase/supabase-js";

export type EventRole = "creator" | "admin" | "member";
export type EventStatus = "active" | "expired";
export type GalleryAccessStatus = "owner" | "approved" | "pending" | "none";

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
  description?: string;
  date: string;
  location: string;
  tags: string[];
  allowAnyoneUpload: boolean;
  privateGallery?: boolean;
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
  status: EventStatus;
  role: EventRole;
}

export interface EventDetail {
  id: string;
  name: string;
  description?: string;
  date: string;
  location: string;
  tags: string[];
  allowAnyoneUpload: boolean;
  privateGallery: boolean;
  galleryAccessStatus: GalleryAccessStatus;
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
  location?: string;
  hostName: string;
  coverUrl?: string;
  photoCount: number;
  memberCount: number;
  status: EventStatus;
  joinToken: string;
  alreadyJoined?: boolean;
  allowAnyoneUpload?: boolean;
  privateGallery?: boolean;
  galleryAccessStatus?: GalleryAccessStatus;
}

export interface PublicEventGalleryResponse {
  event: JoinPreview;
  photos: Photo[];
}

export interface EventJoinResponse {
  eventId: string;
  alreadyJoined: boolean;
  role: EventRole;
}

export interface Photo {
  id: string;
  cloudinaryUrl: string;
  thumbnailUrl?: string;
  originalFilename?: string;
  uploaderName?: string;
  uploaderIsAnonymous?: boolean;
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

export interface GalleryAccessEntry {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  status: "pending" | "approved";
  requestedAt: string;
  approvedAt?: string;
}

export interface GalleryAccessRequestResponse {
  status: GalleryAccessStatus;
}

export interface EventPerson {
  id: string;
  name: string;
  email?: string;
  role?: EventRole;
  joinedAt?: string;
  avatarUrl?: string;
  kind: "member" | "anonymous";
  uploadCount: number;
  galleryAccessStatus?: GalleryAccessStatus;
}

export interface EventPeopleResponse {
  event: EventDetail;
  people: EventPerson[];
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
  photos: Photo[];
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
