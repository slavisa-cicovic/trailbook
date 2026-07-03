import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';
import { sqlite } from '@/core/db';

const DATABASE_NAME = 'trailbook.db';

function timestampForFileName(date: Date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export async function exportDatabase(): Promise<Result<void>> {
  try {
    const sharingAvailable = await Sharing.isAvailableAsync();
    if (!sharingAvailable) return err('Sharing is not available on this device');

    await sqlite.execAsync('PRAGMA wal_checkpoint(FULL);');

    const sourceUri = `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;
    const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
    if (!sourceInfo.exists) return err('Local database file not found');

    const exportDir = `${FileSystem.cacheDirectory}database_exports/`;
    await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });

    const exportUri = `${exportDir}trailbook-${timestampForFileName(new Date())}.db`;
    await FileSystem.copyAsync({ from: sourceUri, to: exportUri });

    await Sharing.shareAsync(exportUri, {
      dialogTitle: 'Export Trailbook database',
      mimeType: 'application/x-sqlite3',
      UTI: 'public.database',
    });

    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
