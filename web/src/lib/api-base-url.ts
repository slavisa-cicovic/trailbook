export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) return normalizeApiBaseUrl(configured);

  return "http://localhost:3001/api/v1";
}

function normalizeApiBaseUrl(url: string) {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? `${trimmed}/v1` : trimmed;
}
