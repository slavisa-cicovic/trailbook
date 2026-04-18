export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  providers: string[];
}

export interface AdminDashboardMetrics {
  range: {
    from: string;
    to: string;
  };
  overview: {
    totalUsers: number;
    newUsers: number;
    tripsCreated: number;
    totalTripPoints: number;
    averageTripPointsPerTrip: number;
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
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
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
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
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
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
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
    segmentLocalId: string | null;
  }>;
  pauses: Array<{
    startedAt: string;
    endedAt: string | null;
  }>;
}

export type SocialAuthProvider = "google" | "apple" | "facebook";
export type SocialAuthAvailability = Record<SocialAuthProvider, boolean>;

function getApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001/api`;
  }

  return "http://localhost:3001/api";
}

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

export async function register(input: RegisterInput) {
  return request<{ success: boolean; email: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export async function forgotPassword(input: ForgotPasswordInput) {
  return request<{ success: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resetPassword(input: ResetPasswordInput) {
  return request<{ success: boolean }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
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
  return request<UserTripDetail>(`/trips/${tripId}`, {
    method: "GET",
  });
}

export async function updateTrip(tripId: string, input: { title?: string; description?: string }) {
  return request<{ trip: UserTripDetail["trip"] }>(`/trips/${tripId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function saveTripEdit(tripId: string, input: {
  trip: { title: string; description: string | null };
  segments: UserTripDetail["segments"];
  points: UserTripDetail["points"];
  waypoints: UserTripDetail["waypoints"];
  pauses: UserTripDetail["pauses"];
}) {
  return request<UserTripDetail>(`/trips/${tripId}/edit`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
