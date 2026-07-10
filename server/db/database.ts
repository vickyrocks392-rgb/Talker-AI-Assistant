/**
 * SQLite database singleton.
 *
 * Opens a single Better-SQLite3 connection and runs the migration
 * runner on startup to ensure the schema is up to date.
 *
 * All schema creation logic has been moved to individual migration
 * files in the migrations/ directory.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { runMigrations } from "./migration_runner";

const STORAGE_DIR = path.join(process.cwd(), "storage");
const DB_PATH = path.join(STORAGE_DIR, "talker.db");

let db: Database.Database | null = null;

/**
 * Ensures the storage directory exists.
 */
function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Returns the singleton database instance.
 * Creates the database and runs pending migrations on the first call.
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  ensureStorageDir();

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Run pending migrations to bring schema up to date
  runMigrations(db);

  return db;
}

/**
 * Closes the database connection (useful for graceful shutdown).
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}