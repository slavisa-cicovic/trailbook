import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import { createTrailbookDatabase } from './databaseBootstrap';

export const sqlite = createTrailbookDatabase();

export const db = drizzle(sqlite, { schema });
