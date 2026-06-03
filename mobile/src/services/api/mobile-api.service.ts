import { z } from "zod";

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BackendRequestError";
  }
}

export function getApiBaseUrl() {
  const configuredBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_SERVER_API_URL;

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return "http://localhost:3001/api";
}

export async function requestFromBackend<T>(
  path: string,
  init?: RequestInit,
  sessionToken?: string,
  schema?: z.ZodType<T>,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken
          ? {
              Authorization: `Bearer ${sessionToken}`,
            }
          : {}),
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new BackendRequestError("Trailbook could not reach the server in time.");
    }

    throw new BackendRequestError("Trailbook could not connect to the server.");
  }

  clearTimeout(timeoutId);

  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } & T | null;

  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new BackendRequestError(message || `Request failed with status ${response.status}`, response.status);
  }

  if (schema) {
    const result = schema.safeParse(payload);
    if (!result.success) {
      if (__DEV__) {
        console.warn("[API] Response validation failed", path, result.error.flatten());
      }
      throw new BackendRequestError(`Unexpected response format from server`, response.status);
    }
    return result.data;
  }

  return (payload || {}) as T;
}
