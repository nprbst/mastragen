import { Migrator, FileMigrationProvider } from 'kysely';
import type { Kysely } from 'kysely';
import * as path from 'path';
import { promises as fs } from 'fs';
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

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`[Migrator] ✓ ${it.migrationName}`);
    } else if (it.status === 'Error') {
      console.error(`[Migrator] ✗ ${it.migrationName}`);
    }
  });

  if (error) {
    console.error('[Migrator] Migration failed:', error);
    throw error;
  }
}
