import { Kysely } from 'kysely';
import { BunSqliteDialect } from 'kysely-bun-sqlite';
import { Database as BunSQLiteDatabase } from 'bun:sqlite';
import type { Database } from './types.ts';

/**
 * Creates a Kysely database instance connected to the specified SQLite database.
 * Uses Bun's native SQLite implementation via kysely-bun-sqlite.
 *
 * @param path - Path to the SQLite database file (default: ./data/mastragen.db)
 * @returns Kysely database instance
 */
export function createDatabase(path: string = './data/mastragen.db'): Kysely<Database> {
  const dialect = new BunSqliteDialect({
    database: new BunSQLiteDatabase(path),
  });

  return new Kysely<Database>({
    dialect,
  });
}

export type { Database } from './types.ts';
