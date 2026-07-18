#!/usr/bin/env node

/**
 * Copies SQL migration files from the source directory into the production
 * bundle (dist/migrations) so the migration runner can discover them at
 * runtime via __dirname-based path resolution.
 *
 * This script is cross-platform (Windows, macOS, Linux) and avoids
 * hardcoded absolute paths.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, "..", "server", "db", "migrations");
const TARGET_DIR = path.resolve(__dirname, "..", "dist", "migrations");

function copyMigrations() {
  // Ensure the target directory exists
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  // Read all SQL files from the source migrations directory
  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".sql"));

  if (files.length === 0) {
    console.warn("⚠ No SQL migration files found in", SOURCE_DIR);
    process.exit(0);
  }

  for (const file of files) {
    const src = path.join(SOURCE_DIR, file);
    const dest = path.join(TARGET_DIR, file);
    fs.copyFileSync(src, dest);
    console.log(`✓ Copied ${file} → dist/migrations/`);
  }

  console.log(`\n✔ ${files.length} migration file(s) copied successfully.`);
}

copyMigrations();