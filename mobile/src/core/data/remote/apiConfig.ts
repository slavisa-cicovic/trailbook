const configuredApiUrl =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

function normalizeApiUrl(url: string) {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? `${trimmed}/v1` : trimmed;
}

export const API_BASE_URL = normalizeApiUrl(configuredApiUrl || 'http://localhost:3001/api/v1');
