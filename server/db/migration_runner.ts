/**
 * Migration Runner — applies SQL migration files to the SQLite database.
 *
 * Scans the migrations directory, compares against the schema_migrations
 * table, and applies any unapplied migrations in lexical order.
 *
 * Each migration runs inside a transaction. If a migration fails, the
 * transaction is rolled back and the server startup is aborted to prevent
 * inconsistent schema states.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { createLogger } from "../utils/logger";

const logger = createLogger("MigrationRunner");

const MIGRATIONS_DIR = path.join(import.meta.dirname, "migrations");

/**
 * Ensures the schema_migrations tracking table exists.
 */
function ensureMigrationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Returns the list of applied migration versions from the database.
 */
function getAppliedMigrations(db: Database.Database): Set<string> {
  const rows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as { version: string }[];

  return new Set(rows.map((r) => r.version));
}

/**
 * Scans the migrations directory and returns migration file entries
 * sorted by filename (lexical order).
 */
interface MigrationFile {
  version: string;
  filename: string;
  filepath: string;
}

function scanMigrationFiles(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.warn(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexical ordering: 001_, 002_, etc.

  return files.map((filename) => ({
    version: filename.replace(/\.sql$/, ""),
    filename,
    filepath: path.join(MIGRATIONS_DIR, filename),
  }));
}

/**
 * Applies a single migration file inside a transaction.
 * Throws on failure, which triggers a rollback.
 */
function applyMigration(
  db: Database.Database,
  migration: MigrationFile,
): void {
  const sql = fs.readFileSync(migration.filepath, "utf-8").trim();

  if (!sql) {
    logger.warn(`  Migration ${migration.filename} is empty, skipping`);
    return;
  }

  // Run the migration SQL inside a transaction
  db.exec(sql);

  // Record the migration as applied
  db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(
    migration.version,
  );
}

/**
 * Runs all pending migrations.
 *
 * @returns The number of migrations that were applied.
 * @throws If any migration fails, the error propagates up and
 *         the server startup should abort.
 */
export function runMigrations(db: Database.Database): number {
  ensureMigrationTable(db);

  const applied = getAppliedMigrations(db);
  const pending = scanMigrationFiles().filter(
    (m) => !applied.has(m.version),
  );

  if (pending.length === 0) {
    logger.info("Database schema up to date.");
    return 0;
  }

  let appliedCount = 0;

  for (const migration of pending) {
    logger.info(`Applying migration ${migration.filename}`);

    try {
      // Wrap each migration in a transaction for safety
      const applyTx = db.transaction(() => {
        applyMigration(db, migration);
      });

      applyTx();
      logger.info("Migration applied successfully");
      appliedCount++;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Migration ${migration.filename} FAILED:\n${message}`,
      );
      logger.error(
        "Server startup aborted — database schema may be inconsistent.",
      );
      throw error;
    }
  }

  return appliedCount;
}

/**
 * Returns the status of all migrations (applied or pending).
 */
export function getMigrationStatus(
  db: Database.Database,
): { version: string; filename: string; applied: boolean }[] {
  ensureMigrationTable(db);

  const applied = getAppliedMigrations(db);
  const allMigrations = scanMigrationFiles();

  return allMigrations.map((m) => ({
    version: m.version,
    filename: m.filename,
    applied: applied.has(m.version),
  }));
}

/**
 * Returns the latest applied migration version, or null if none.
 */
export function getLatestMigrationVersion(
  db: Database.Database,
): string | null {
  ensureMigrationTable(db);

  const row = db
    .prepare(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    )
    .get() as { version: string } | undefined;

  return row?.version ?? null;
}

/**
 * Resets the database by dropping all application tables and
 * clearing migration history. Then re-runs all migrations.
 *
 * WARNING: This destroys all data. For development use only.
 */
export function resetDatabase(db: Database.Database): void {
  logger.warn("Resetting database — all data will be lost!");

  const dropAll = db.transaction(() => {
    // Drop application tables (order matters due to foreign keys)
    db.exec(`
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS documents;
      DROP TABLE IF EXISTS conversations;
      DROP TABLE IF EXISTS schema_migrations;
    `);
  });

  dropAll();
  logger.info("All tables dropped. Re-running migrations...");

  // Re-run all migrations from scratch
  runMigrations(db);

  logger.info("Database reset complete.");
}