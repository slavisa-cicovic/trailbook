import { getApiBaseUrl } from "./api-base-url";

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "test_user" | "admin";
  providers: string[];
}

export function isTripUserRole(role: AuthUser["role"]) {
  return role === "user" || role === "test_user" || role === "admin";
}

export interface AdminDashboardMetrics {
  range: {
    from: string;
    to: string;
  };
  overview: {
    totalUsers: number;
    newUsers: number;
    activeSubscribers: number;
    activeMonthlySubscribers: number;
    activeYearlySubscribers: number;
    tripsCreated: number;
    photosCreated: number;
    totalPhotoBytes: number;
  };
}

export interface UserTripOverview {
  range: {
    from: string | null;
    to: string | null;
  };
  summary: {
    trips: number;
    waypoints: number;
    photos: number;
  };
  trips: Array<{
    id: string;
    title: string;
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane" | "stationary";
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
    waypointCount: number;
    photoCount: number;
  }>;
}

export interface UserTripDetail {
  trip: {
    id: string;
    title: string;
    description: string | null;
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane" | "stationary";
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
    syncStatus: "local-only" | "pending-sync" | "synced";
  };
  summary: {
    distanceMeters: number;
    waypointCount: number;
    photoCount: number;
    segmentCount: number;
  };
  points: Array<{
    localId: string;
    latitude: number;
    longitude: number;
    recordedAt: string;
    segmentLocalId: string | null;
    accuracy: number | null;
    altitude: number | null;
    speed: number | null;
  }>;
  segments: Array<{
    localId: string;
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane" | "stationary";
    startedAt: string;
    endedAt: string | null;
    distanceMeters: number;
  }>;
  waypoints: Array<{
    localId: string;
    category: "generic" | "departure" | "fuel" | "border" | "port" | "ferry" | "restaurant" | "cafe" | "viewpoint" | "monument" | "beach";
    title: string;
    note: string | null;
    latitude: number;
    longitude: number;
    recordedAt: string;
    photoCount: number;
    images: Array<{ getUrl: string; imageId: string; objectKey: string }>;
    segmentLocalId: string | null;
  }>;
  pauses: Array<{
    startedAt: string;
    endedAt: string | null;
  }>;
}

export type SocialAuthProvider = "google" | "apple";
export interface SocialAuthAvailability {
  google: boolean;
  apple: boolean;
  localAccounts?: string[];
}

export type LocalAccount = "scaichat" | "slavisacicovic";

export function getSocialAuthStartUrl(provider: SocialAuthProvider) {
  return `${getApiBaseUrl()}/auth/${provider}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } & T | null;

  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload?.message.join(", ") : payload?.message;
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (payload || {}) as T;
}

export async function login(input: LoginInput) {
  return request<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function logout() {
  return request<{ success: boolean }>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getCurrentUser() {
  return request<{ user: AuthUser | null }>("/auth/me", {
    method: "GET",
  });
}

export async function getSocialAuthProviders() {
  return request<SocialAuthAvailability>("/auth/providers", {
    method: "GET",
  });
}

export async function loginWithLocalAccount(account: LocalAccount) {
  return request<{ user: AuthUser }>("/auth/local-login", {
    method: "POST",
    body: JSON.stringify({ account }),
  });
}

export async function getAdminDashboardMetrics(input: { from: string; to: string }) {
  const query = new URLSearchParams({
    from: input.from,
    to: input.to,
  });

  return request<AdminDashboardMetrics>(`/admin/dashboard?${query.toString()}`, {
    method: "GET",
  });
}

export async function getTripOverview(input?: { from?: string; to?: string }) {
  const query = new URLSearchParams();

  if (input?.from && input?.to) {
    query.set("from", input.from);
    query.set("to", input.to);
  }

  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";

  return request<UserTripOverview>(`/trips/overview${suffix}`, {
    method: "GET",
  });
}

export async function getTripDetail(tripId: string) {
  return request<UserTripDetail>(`/trips/web/${tripId}`, {
    method: "GET",
  });
}
