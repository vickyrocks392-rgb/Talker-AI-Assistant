/**
 * SQLite database singleton.
 *
 * Creates and manages a single Better-SQLite3 connection.
 * Tables are automatically created on first load.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

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
 * Creates the required tables if they do not already exist.
 */
function createTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id               TEXT PRIMARY KEY,
      conversation_id  TEXT NOT NULL,
      role             TEXT NOT NULL,
      content          TEXT NOT NULL,
      created_at       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages (conversation_id);

    CREATE INDEX IF NOT EXISTS idx_messages_created_at
      ON messages (created_at);

    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
      ON conversations (updated_at);
  `);
}

/**
 * Returns the singleton database instance.
 * Creates the database and tables on the first call.
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  ensureStorageDir();

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  createTables(db);

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