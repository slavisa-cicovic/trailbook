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

function getApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001/api`;
  }

  return "http://localhost:3001/api";
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
  return request<{ user: AuthUser }>("/auth/register", {
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
