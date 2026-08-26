export type DatabaseSecurityMode = 'plaintext' | 'encrypted';

const LOCAL_ENCRYPTED_SUFFIX = '.local.encrypted';
const LOCAL_SUFFIX = '.local';

export function databaseSecurityModeForApplicationId(
  applicationId: string,
): DatabaseSecurityMode {
  if (applicationId.endsWith(LOCAL_ENCRYPTED_SUFFIX)) return 'encrypted';
  if (applicationId.endsWith(LOCAL_SUFFIX)) return 'plaintext';
  return 'encrypted';
}

export function databaseNameForSecurityMode(mode: DatabaseSecurityMode): string {
  return mode === 'encrypted' ? 'trailbook-encrypted.db' : 'trailbook.db';
}
