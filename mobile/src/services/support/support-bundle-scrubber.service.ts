const SENSITIVE_KEY_PATTERN = /(authorization|cookie|password|secret|token)/i;
const URL_SECRET_QUERY_PATTERN =
  /([?&](?:access_token|authorization|password|refresh_token|secret|session|session_token|token)=)[^&#\s]+/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

function scrubString(value: string): string {
  return value
    .replace(URL_SECRET_QUERY_PATTERN, "$1[redacted]")
    .replace(BEARER_TOKEN_PATTERN, "Bearer [redacted]");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scrubSupportBundleValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value.map(scrubSupportBundleValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : scrubSupportBundleValue(childValue),
    ]),
  );
}
