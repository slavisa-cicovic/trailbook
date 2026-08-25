import { APP_ENVIRONMENT } from '@/core/config/appEnvironment';

const configuredApiUrl = APP_ENVIRONMENT === 'local'
  ? process.env.EXPO_PUBLIC_LOCAL_API_URL?.trim() || 'http://localhost:3001/api/v1'
  : APP_ENVIRONMENT === 'test'
    ? process.env.EXPO_PUBLIC_TEST_API_URL?.trim()
    : process.env.EXPO_PUBLIC_API_URL?.trim() ||
      process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

function normalizeApiUrl(url: string) {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? `${trimmed}/v1` : trimmed;
}

if (!configuredApiUrl) {
  throw new Error(`API URL is not configured for the ${APP_ENVIRONMENT} app environment.`);
}

export const API_BASE_URL = normalizeApiUrl(configuredApiUrl);
