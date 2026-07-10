#!/usr/bin/env tsx
/**
 * Migration CLI — command-line interface for managing database migrations.
 *
 * Usage:
 *   npx tsx server/db/migrate.ts          # Run pending migrations
 *   npx tsx server/db/migrate.ts status   # Show migration status
 *   npx tsx server/db/migrate.ts reset    # Reset database (dev only)
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  runMigrations,
  getMigrationStatus,
  getLatestMigrationVersion,
  resetDatabase,
} from "./migration_runner";

const STORAGE_DIR = path.join(process.cwd(), "storage");
const DB_PATH = path.join(STORAGE_DIR, "talker.db");

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function openDatabase(): Database.Database {
  ensureStorageDir();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

function cmdMigrate(): void {
  const db = openDatabase();
  try {
    const count = runMigrations(db);
    if (count > 0) {
      console.log(`\nApplied ${count} migration(s).`);
    }
  } finally {
    db.close();
  }
}

function cmdStatus(): void {
  const db = openDatabase();
  try {
    const statuses = getMigrationStatus(db);
    const latest = getLatestMigrationVersion(db);

    for (const s of statuses) {
      const icon = s.applied ? "\u2713" : " ";
      console.log(`${icon} ${s.filename}`);
    }

    if (latest) {
      console.log(`\nDatabase schema version: ${latest}`);
    } else {
      console.log("\nNo migrations have been applied.");
    }
  } finally {
    db.close();
  }
}

function cmdReset(): void {
  const db = openDatabase();
  try {
    resetDatabase(db);
  } finally {
    db.close();
  }
}

// ── CLI entry point ──────────────────────────────────────────────────

const command = process.argv[2]?.toLowerCase();

switch (command) {
  case "status":
    cmdStatus();
    break;
  case "reset":
    cmdReset();
    break;
  default:
    cmdMigrate();
    break;
}