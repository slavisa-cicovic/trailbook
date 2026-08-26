import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import {
  defaultDatabaseDirectory,
  deleteDatabaseSync,
  openDatabaseSync,
  type SQLiteDatabase,
} from 'expo-sqlite';
import {
  databaseNameForSecurityMode,
  databaseSecurityModeForApplicationId,
} from './databaseSecurityPolicy';

const PROD_APPLICATION_ID = 'com.slavisacicovic.trailbook';
const PLAINTEXT_DATABASE_NAME = 'trailbook.db';
const ENCRYPTED_DATABASE_NAME = 'trailbook-encrypted.db';
const MIGRATION_DATABASE_NAME = 'trailbook-encrypted-migration.db';
const DATABASE_KEY_NAME = 'trailbook.database.key.v1';
const DATABASE_KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function filePath(name: string): string {
  return `${defaultDatabaseDirectory.replace(/\/$/, '')}/${name}`;
}

function fileUri(name: string): string {
  const path = filePath(name);
  return path.startsWith('file://') ? path : `file://${path}`;
}

function databaseFileExists(name: string): boolean {
  return new File(fileUri(name)).exists;
}

function deleteFileIfPresent(name: string): void {
  const file = new File(fileUri(name));
  if (file.exists) file.delete();
}

function deleteDatabaseFiles(name: string): void {
  if (databaseFileExists(name)) deleteDatabaseSync(name);
  deleteFileIfPresent(`${name}-wal`);
  deleteFileIfPresent(`${name}-shm`);
  deleteFileIfPresent(`${name}-journal`);
}

function randomKeyHex(): string {
  return Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requireKeyHex(encryptedDatabaseExists: boolean): string {
  const existing = SecureStore.getItem(DATABASE_KEY_NAME, DATABASE_KEY_OPTIONS);
  if (existing) {
    if (!/^[0-9a-f]{64}$/i.test(existing)) {
      throw new Error('The local database encryption key is invalid. Restore the app data from cloud backup.');
    }
    return existing.toLowerCase();
  }
  if (encryptedDatabaseExists) {
    throw new Error('The local database encryption key is unavailable. Restore the app data from cloud backup.');
  }

  const generated = randomKeyHex();
  SecureStore.setItem(DATABASE_KEY_NAME, generated, DATABASE_KEY_OPTIONS);
  return generated;
}

function keyDatabase(database: SQLiteDatabase, keyHex: string): void {
  database.execSync(`PRAGMA key = "x'${keyHex}'";`);
  const cipherVersion = database.getFirstSync<{ cipher_version: string }>('PRAGMA cipher_version;');
  if (!cipherVersion?.cipher_version) {
    throw new Error('Encrypted database support is missing from this build.');
  }
  database.getFirstSync('SELECT count(*) AS count FROM sqlite_master;');
}

function openEncryptedDatabase(name: string, keyHex: string): SQLiteDatabase {
  const database = openDatabaseSync(name, {
    enableChangeListener: true,
    useNewConnection: true,
  });
  try {
    keyDatabase(database, keyHex);
    return database;
  } catch (error) {
    database.closeSync();
    throw error;
  }
}

function validateMigratedDatabase(name: string, keyHex: string): void {
  const database = openEncryptedDatabase(name, keyHex);
  try {
    const integrityRows = database.getAllSync<Record<string, string>>('PRAGMA cipher_integrity_check;');
    const values = integrityRows.flatMap((row) => Object.values(row));
    if (values.some((value) => value.toLowerCase() !== 'ok')) {
      throw new Error('Encrypted database integrity verification failed.');
    }
    database.getFirstSync('SELECT count(*) AS count FROM sqlite_master;');
  } finally {
    database.closeSync();
  }
}

function migratePlaintextDatabase(keyHex: string): void {
  deleteDatabaseFiles(MIGRATION_DATABASE_NAME);
  const plaintext = openDatabaseSync(PLAINTEXT_DATABASE_NAME, { useNewConnection: true });
  try {
    plaintext.execSync('PRAGMA wal_checkpoint(FULL);');
    const targetPath = filePath(MIGRATION_DATABASE_NAME).replace(/'/g, "''");
    plaintext.execSync(
      `ATTACH DATABASE '${targetPath}' AS encrypted KEY "x'${keyHex}'";` +
      `SELECT sqlcipher_export('encrypted');` +
      `DETACH DATABASE encrypted;`,
    );
  } finally {
    plaintext.closeSync();
  }

  validateMigratedDatabase(MIGRATION_DATABASE_NAME, keyHex);
  new File(fileUri(MIGRATION_DATABASE_NAME)).move(new File(fileUri(ENCRYPTED_DATABASE_NAME)));
  validateMigratedDatabase(ENCRYPTED_DATABASE_NAME, keyHex);
  deleteDatabaseFiles(PLAINTEXT_DATABASE_NAME);
}

function createEncryptedDatabase(): SQLiteDatabase {
  const encryptedExists = databaseFileExists(ENCRYPTED_DATABASE_NAME);
  const keyHex = requireKeyHex(encryptedExists);

  if (!encryptedExists && databaseFileExists(PLAINTEXT_DATABASE_NAME)) {
    migratePlaintextDatabase(keyHex);
  }

  const database = openEncryptedDatabase(ENCRYPTED_DATABASE_NAME, keyHex);
  // A previous process may have been interrupted after the verified encrypted
  // file was promoted but before plaintext cleanup. A successfully keyed final
  // database is authoritative, so remove that residual plaintext now.
  if (databaseFileExists(PLAINTEXT_DATABASE_NAME)) {
    deleteDatabaseFiles(PLAINTEXT_DATABASE_NAME);
  }
  deleteDatabaseFiles(MIGRATION_DATABASE_NAME);
  return database;
}

const applicationId = Application.applicationId ?? PROD_APPLICATION_ID;
export const databaseSecurityMode = databaseSecurityModeForApplicationId(applicationId);
export const databaseName = databaseNameForSecurityMode(databaseSecurityMode);

export function createTrailbookDatabase(): SQLiteDatabase {
  return databaseSecurityMode === 'plaintext'
    ? openDatabaseSync(databaseName, { enableChangeListener: true })
    : createEncryptedDatabase();
}
