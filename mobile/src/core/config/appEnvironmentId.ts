export type AppEnvironment = 'local' | 'test' | 'prod';

export function appEnvironmentForApplicationId(applicationId: string): AppEnvironment {
  if (applicationId.endsWith('.local')) return 'local';
  if (applicationId.endsWith('.test')) return 'test';
  return 'prod';
}
