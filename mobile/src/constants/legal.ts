export const TRAILBOOK_SUPPORT_EMAIL = 'sc.trailbook@gmail.com';
export const TRAILBOOK_PRIVACY_POLICY_URL = 'https://trailbook.rs/privacy';
export const TRAILBOOK_TERMS_OF_USE_URL = 'https://trailbook.rs/terms';
export const APPLE_MANAGE_SUBSCRIPTIONS_URL =
  'https://apps.apple.com/account/subscriptions';

export function purchaseSupportUrl() {
  return `mailto:${TRAILBOOK_SUPPORT_EMAIL}?subject=Trailbook%20purchase%20support`;
}
