export type AppEnvironment = 'local' | 'test' | 'prod';

export function appEnvironmentForApplicationId(applicationId: string): AppEnvironment {
  if (applicationId.endsWith('.local.encrypted')) return 'local';
  if (applicationId.endsWith('.local')) return 'local';
  if (applicationId.endsWith('.test')) return 'test';
  return 'prod';
}

export function oauthSchemeForApplicationId(applicationId: string): string {
  if (applicationId.endsWith('.local.encrypted')) return 'trailbook-local-encrypted';
  const environment = appEnvironmentForApplicationId(applicationId);
  return environment === 'prod' ? 'trailbook' : `trailbook-${environment}`;
}
