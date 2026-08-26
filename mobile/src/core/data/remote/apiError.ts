export const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign out and sign in again.';

export const NETWORK_ERROR_MESSAGE =
  'Trailbook could not connect to the server. Check your internet connection and try again.';

export const SERVER_ERROR_MESSAGE =
  'Trailbook server is temporarily unavailable. Please try again later.';

function messageFromBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (Array.isArray(parsed.message)) {
      const messages = parsed.message.filter((value): value is string => typeof value === 'string');
      if (messages.length > 0) return messages.join('\n');
    }
  } catch {
    // Non-JSON server responses are intentionally not shown to users.
  }

  return null;
}

export async function apiResponseErrorMessage(
  response: Response,
  unauthorizedMessage = SESSION_EXPIRED_MESSAGE,
): Promise<string> {
  if (response.status === 401) return unauthorizedMessage;
  if (response.status >= 500) return SERVER_ERROR_MESSAGE;

  const body = await response.text().catch(() => '');
  return messageFromBody(body) || `The request could not be completed (error ${response.status}).`;
}

export function apiNetworkErrorMessage(): string {
  return NETWORK_ERROR_MESSAGE;
}
