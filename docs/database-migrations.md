# Database Migrations

Talker AI uses a lightweight, file-based SQLite migration system to manage database schema evolution. This document explains how migrations work, how to create new ones, and how to manage the database lifecycle.

## How Migrations Work

On server startup, the migration runner:

1. Creates a `schema_migrations` tracking table if it doesn't exist.
2. Scans the `server/db/migrations/` directory for `.sql` files.
3. Compares the files against the `schema_migrations` table to find unapplied migrations.
4. Applies each unapplied migration **in lexical order** inside a transaction.
5. Records each successful migration in `schema_migrations`.
6. If any migration fails, the transaction is rolled back and the server **aborts startup** to prevent an inconsistent schema.

## Migration File Structure

All migration files live in `server/db/migrations/`:

```
server/db/migrations/
├── 001_initial_schema.sql
├── 002_documents_table.sql
├── 003_add_embedding_model.sql
└── ...
```

### Naming Rules

- **Prefix with a zero-padded number**: `001_`, `002_`, `003_`, etc.
- **Use a descriptive name** after the number: `add_embedding_model`, `create_users_table`.
- **Extension must be `.sql`**.
- **Never rename or edit an existing migration** after it has been applied to any environment.

Example:

```
004_add_user_preferences.sql
005_create_indexes_for_search.sql
```

## Creating a New Migration

1. Determine the next sequence number by looking at existing files.
2. Create a new file: `server/db/migrations/004_your_description.sql`.
3. Write your SQL using only SQLite-compatible syntax.
4. Test the migration locally using `npm run migrate`.

### Guidelines

- **Use `CREATE TABLE IF NOT EXISTS`** for new tables to make migrations idempotent.
- **Use `ALTER TABLE ADD COLUMN`** for new columns. SQLite supports adding columns but not modifying or removing them.
- **Wrap complex changes** in a transaction if you need multiple statements to be atomic (the runner already wraps each file in a transaction).
- **Do not use `DROP TABLE`** in a migration unless you are certain no data will be lost.
- **Test both fresh installs and upgrades** from the previous migration.

## CLI Commands

### Run pending migrations

```bash
npm run migrate
```

This applies all unapplied migrations in order. It is automatically run on server startup, but you can also run it manually.

### Check migration status

```bash
npm run migrate:status
```

Output example:

```
✓ 001_initial_schema.sql
✓ 002_documents_table.sql
✓ 003_add_embedding_model.sql

Database schema version: 003
```

### Reset the database (development only)

```bash
npm run migrate:reset
```

**WARNING:** This drops all tables and re-runs all migrations from scratch. All data will be lost.

## Rollback Strategy

SQLite has limited ALTER TABLE support. The migration system does **not** support automatic rollbacks of individual migrations. Instead, follow these strategies:

### For development

Use `npm run migrate:reset` to wipe and rebuild the database.

### For production

- **Never roll back a migration** that has been applied to production.
- To undo a change, create a **new migration** that reverses it (e.g., if you added a column you no longer need, create a migration that ignores it — SQLite cannot drop columns).
- If a migration fails in production, the server will not start. Fix the migration and re-deploy.

### Manual rollback (emergency only)

If you absolutely must revert, you can manually delete the row from `schema_migrations` and re-run the previous migration. This is **not recommended** and should only be done with a verified backup.

```sql
DELETE FROM schema_migrations WHERE version = '004_bad_migration';
```

Then re-run `npm run migrate` to re-apply the fixed migration.

## Production Safety

- If a migration fails, the server **will not start**.
- The error message includes the exact SQL that failed.
- No partial migration state is possible because each migration runs inside a transaction.
- Always test migrations on a copy of the production database before deploying.

## Architecture

```
server/db/
├── database.ts           # Opens SQLite connection, runs migrations
├── migrate.ts            # CLI tool for manual migration management
├── migration_runner.ts   # Core migration engine
└── migrations/           # SQL migration files
    ├── 001_initial_schema.sql
    ├── 002_documents_table.sql
    ├── 003_add_embedding_model.sql
    └── ...
```

The `schema_migrations` table tracks which migrations have been applied:

```sql
CREATE TABLE schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Troubleshooting

### "table documents has no column named embedding_model"

This error occurs when an existing database was created before the `embedding_model` column was added. The migration system handles this automatically — just run `npm run migrate` or restart the server.

### Migration fails with "duplicate column name"

This happens if a migration tries to add a column that already exists. The migration runner wraps each file in a transaction, so the failed migration is rolled back. To fix:

1. Check if the column already exists in the database.
2. If it does, mark the migration as applied by inserting into `schema_migrations` manually, or create a new migration that skips the duplicate.
3. Re-run `npm run migrate`.

### Server won't start after migration failure

1. Check the error message for the exact SQL that failed.
2. Fix the migration file.
3. If the migration was partially applied (unlikely due to transactions), run `npm run migrate:reset` in development or manually fix the schema in production.
4. Restart the server.