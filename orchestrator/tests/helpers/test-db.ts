import { existsSync, unlinkSync } from 'node:fs';
import type { Kysely } from 'kysely';
import { createDatabase } from '../../src/db/index.ts';
import { runMigrations as runMigrations001 } from '../../src/db/migrations/001_initial.ts';
import { runMigrations as runMigrations002 } from '../../src/db/migrations/002_git_fields.ts';
import { runMigrations as runMigrations003 } from '../../src/db/migrations/003_cui_config.ts';
import { runMigrations as runMigrations004 } from '../../src/db/migrations/004_indexes.ts';
import { runMigrations as runMigrations005 } from '../../src/db/migrations/005_rename_cui_to_claude.ts';
import type { Database } from '../../src/db/types.ts';

// Test database path generator to ensure unique paths per test file
export function getTestDbPath(testName: string): string {
  return `./data/test-${testName}-${Date.now()}.db`;
}

// Create a fresh test database with all migrations applied
export async function createTestDb(dbPath: string): Promise<Kysely<Database>> {
  // Clean up any existing test database
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  const db = createDatabase(dbPath);

  // Run all migrations
  await runMigrations001(db);
  await runMigrations002(db);
  await runMigrations003(db);
  await runMigrations004(db);
  await runMigrations005(db);

  return db;
}

// Clean up test database
export async function cleanupTestDb(db: Kysely<Database>, dbPath: string): Promise<void> {
  await db.destroy();
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
}

// Helper to create test database with automatic cleanup
export function withTestDb(testName: string) {
  const dbPath = getTestDbPath(testName);
  let db: Kysely<Database>;

  return {
    async setup(): Promise<Kysely<Database>> {
      db = await createTestDb(dbPath);
      return db;
    },
    async cleanup(): Promise<void> {
      if (db) {
        await cleanupTestDb(db, dbPath);
      }
    },
    getDb(): Kysely<Database> {
      return db;
    },
    getPath(): string {
      return dbPath;
    },
  };
}
