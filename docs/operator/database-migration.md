# Database Migration Procedures

This guide covers database migration procedures for Mastragen, including upgrades, rollbacks, and data management.

## Overview

Mastragen uses Kysely for database migrations with support for:
- **SQLite** - Development and small deployments
- **PostgreSQL** - Production deployments

Migrations are located in `orchestrator/src/db/migrations/`.

## Migration Commands

### Check Migration Status

```bash
# Kubernetes
kubectl exec -n mastragen deployment/mastragen-orchestrator -- bun run db:status

# Docker Compose
docker-compose exec orchestrator bun run db:status

# Local development
cd orchestrator && bun run db:status
```

### Run Migrations

```bash
# Kubernetes
kubectl exec -n mastragen deployment/mastragen-orchestrator -- bun run db:migrate

# Docker Compose
docker-compose exec orchestrator bun run db:migrate

# Local development
cd orchestrator && bun run db:migrate
```

### Rollback Last Migration

```bash
# Kubernetes
kubectl exec -n mastragen deployment/mastragen-orchestrator -- bun run db:rollback

# Docker Compose
docker-compose exec orchestrator bun run db:rollback

# Local development
cd orchestrator && bun run db:rollback
```

## Migration File Structure

```
orchestrator/src/db/migrations/
├── 001_create_projects.ts
├── 002_create_sessions.ts
├── 003_create_users.ts
├── 004_create_session_shares.ts
├── 005_create_api_tokens.ts
├── 006_add_suspension_reason.ts
├── 007_create_alert_tables.ts
└── 008_create_idle_config.ts
```

Each migration file exports `up` and `down` functions:

```typescript
import type { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('example')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('example').execute();
}
```

## Pre-Deployment Checklist

Before deploying with migrations:

- [ ] Backup the database
- [ ] Test migrations on a copy of production data
- [ ] Review migration SQL for performance impact
- [ ] Schedule maintenance window for large migrations
- [ ] Prepare rollback plan

## Backup Procedures

### SQLite Backup

```bash
# Kubernetes
kubectl exec -n mastragen deployment/mastragen-orchestrator -- \
  cp /app/data/mastragen.db /app/data/mastragen.db.backup-$(date +%Y%m%d)

# Copy to local
kubectl cp mastragen/mastragen-orchestrator-xxx:/app/data/mastragen.db ./backup/

# Docker Compose
docker-compose exec orchestrator cp /app/data/mastragen.db /app/data/backup-$(date +%Y%m%d).db
docker cp mastragen-orchestrator-1:/app/data/backup-*.db ./backup/
```

### PostgreSQL Backup

```bash
# Kubernetes with PostgreSQL
kubectl exec -n mastragen deployment/postgres -- \
  pg_dump -U mastragen mastragen > /backup/mastragen-$(date +%Y%m%d).sql

# Docker Compose
docker-compose exec postgres pg_dump -U mastragen mastragen > ./backup/mastragen-$(date +%Y%m%d).sql
```

## Restore Procedures

### SQLite Restore

```bash
# Stop the orchestrator
kubectl scale deployment/mastragen-orchestrator -n mastragen --replicas=0

# Copy backup
kubectl cp ./backup/mastragen.db mastragen/mastragen-orchestrator-xxx:/app/data/mastragen.db

# Restart
kubectl scale deployment/mastragen-orchestrator -n mastragen --replicas=1
```

### PostgreSQL Restore

```bash
# Stop the orchestrator
kubectl scale deployment/mastragen-orchestrator -n mastragen --replicas=0

# Restore from backup
kubectl exec -i -n mastragen deployment/postgres -- \
  psql -U mastragen mastragen < ./backup/mastragen-20240115.sql

# Restart
kubectl scale deployment/mastragen-orchestrator -n mastragen --replicas=1
```

## Rollback Scenarios

### Rollback Last Migration

If the latest migration caused issues:

```bash
# 1. Stop the orchestrator to prevent new data
kubectl scale deployment/mastragen-orchestrator -n mastragen --replicas=0

# 2. Run rollback
kubectl exec -n mastragen deployment/mastragen-orchestrator-backup -- bun run db:rollback

# 3. Deploy previous version
helm rollback mastragen -n mastragen

# 4. Start orchestrator
kubectl scale deployment/mastragen-orchestrator -n mastragen --replicas=1
```

### Rollback Multiple Migrations

```bash
# Rollback specific number of migrations
bun run db:rollback --count 3
```

### Emergency Restore from Backup

If migrations corrupted data:

```bash
# 1. Stop all pods
kubectl scale deployment/mastragen-orchestrator -n mastragen --replicas=0

# 2. Restore backup
# (See restore procedures above)

# 3. Deploy previous version
helm rollback mastragen -n mastragen

# 4. Start pods
kubectl scale deployment/mastragen-orchestrator -n mastragen --replicas=1
```

## Large Migration Strategies

For migrations affecting large tables:

### 1. Add Column (Non-Blocking)

```typescript
// Good: Adding nullable column is fast
await db.schema
  .alterTable('sessions')
  .addColumn('new_field', 'text')
  .execute();
```

### 2. Backfill Data Separately

```typescript
// Migration: Add column
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('sessions')
    .addColumn('computed_field', 'text')
    .execute();
}

// Separate script for backfill
// Run during low-traffic period
async function backfill(db: Kysely<any>): Promise<void> {
  const batchSize = 1000;
  let offset = 0;

  while (true) {
    const batch = await db
      .selectFrom('sessions')
      .where('computed_field', 'is', null)
      .limit(batchSize)
      .select(['id'])
      .execute();

    if (batch.length === 0) break;

    for (const row of batch) {
      await db
        .updateTable('sessions')
        .set({ computed_field: 'computed_value' })
        .where('id', '=', row.id)
        .execute();
    }

    offset += batchSize;
    console.log(`Processed ${offset} rows`);
  }
}
```

### 3. Create New Table, Migrate, Swap

```typescript
// For complex table changes:
// 1. Create new table with desired schema
// 2. Copy data in batches
// 3. Rename tables atomically
// 4. Drop old table in next migration
```

## Monitoring Migrations

### Check Migration Lock

```sql
-- SQLite
SELECT * FROM kysely_migration_lock;

-- PostgreSQL
SELECT * FROM kysely_migration_lock;
```

### View Applied Migrations

```sql
SELECT * FROM kysely_migration ORDER BY timestamp;
```

### Check for Pending Migrations

```bash
bun run db:status
```

## Troubleshooting

### Migration Stuck

If a migration appears stuck:

```bash
# Check if migration is actually running
kubectl logs -n mastragen deployment/mastragen-orchestrator --tail=100

# Release lock manually (if migration truly failed)
# WARNING: Only do this if you're sure no migration is running
kubectl exec -n mastragen deployment/mastragen-orchestrator -- \
  sqlite3 /app/data/mastragen.db "DELETE FROM kysely_migration_lock;"
```

### Foreign Key Errors

```sql
-- SQLite: Temporarily disable foreign keys
PRAGMA foreign_keys = OFF;
-- Run migration
PRAGMA foreign_keys = ON;
```

### Out of Disk Space

```bash
# Check disk usage
kubectl exec -n mastragen deployment/mastragen-orchestrator -- df -h

# Clean up if needed
kubectl exec -n mastragen deployment/mastragen-orchestrator -- \
  rm /app/data/*.backup
```

## Best Practices

1. **Always backup before migration**
2. **Test on production-like data first**
3. **Use small, incremental migrations**
4. **Make migrations reversible when possible**
5. **Document breaking changes**
6. **Schedule maintenance windows for large migrations**
7. **Monitor database performance during/after migration**
