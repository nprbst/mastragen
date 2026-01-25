import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FileMigrationProvider, Migrator } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from './types.ts';

/**
 * Creates a Kysely Migrator instance for the database.
 * Uses FileMigrationProvider to load migrations from the migrations folder.
 */
export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(import.meta.dir, 'migrations'),
    }),
  });
}

/**
 * Runs all pending migrations to the latest version.
 * Migrations are tracked in the `kysely_migration` table.
 */
export async function runMigrations(db: Kysely<Database>): Promise<void> {
  const migrator = createMigrator(db);
  const { error, results } = await migrator.migrateToLatest();
  const quiet = process.env.NODE_ENV === 'test';

  for (const it of results ?? []) {
    if (it.status === 'Success') {
      if (!quiet) console.log(`[Migrator] ✓ ${it.migrationName}`);
    } else if (it.status === 'Error') {
      console.error(`[Migrator] ✗ ${it.migrationName}`);
    }
  }

  if (error) {
    console.error('[Migrator] Migration failed:', error);
    throw error;
  }
}
