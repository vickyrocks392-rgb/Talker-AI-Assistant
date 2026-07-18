/**
 * FileValidationService — secure document upload validation (Phase 7.4, Part 3).
 *
 * Validates uploaded files on:
 *   - MIME type
 *   - extension
 *   - filename
 *   - maximum size
 *   - duplicate uploads
 *
 * Rejects:
 *   - executable files
 *   - archives
 *   - scripts
 *   - unsupported formats
 *
 * Sanitises:
 *   - filenames (directory traversal, hidden files, invalid chars)
 *   - metadata / document identifiers
 *
 * Prevents:
 *   - directory traversal
 *   - hidden filenames
 *   - invalid characters
 */

import { SecurityConfig } from "./SecurityConfig";
import { sanitizeFilename } from "./SecurityUtils";
import type { FileValidationResult, FileThreat } from "./SecurityTypes";
import { createLogger } from "../utils/logger";

const logger = createLogger("FileValidation");

// Allowed document formats (mirrors the RAG pipeline's supported types).
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
]);

const ALLOWED_EXTS = new Set([".pdf", ".txt", ".md", ".docx", ".csv"]);

// Dangerous signatures that must never be ingested.
const DANGEROUS_EXTS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".bash", ".zsh",
  ".py", ".js", ".ts", ".rb", ".php", ".pl", ".jar", ".vbs", ".wsf",
  ".scr", ".com", ".msi", ".apk", ".app", ".deb", ".rpm",
  ".zip", ".tar", ".gz", ".tgz", ".rar", ".7z", ".bz2", ".xz",
  ".iso", ".img", ".dmg", ".bin", ".dat", ".msi",
]);

const DANGEROUS_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-executable",
  "application/x-dosexec",
  "application/x-sh",
  "application/x-python",
  "application/x-javascript",
  "application/javascript",
  "application/zip",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-7z-compressed",
];

export interface FileValidationInput {
  /** Original filename as supplied by the client. */
  originalname: string;
  /** MIME type as reported by multer / client. */
  mimetype: string;
  /** File size in bytes. */
  size: number;
  /** Optional hash/identifier used to detect duplicates. */
  contentHash?: string;
  /** Set of existing document identifiers (for duplicate detection). */
  existingIdentifiers?: Array<{ name: string; size: number; hash?: string }>;
}

export class FileValidationService {
  /**
   * Validate an uploaded file.
   *
   * @returns A structured result. `decision` is "block" if the file must be
   *          rejected; otherwise "allow" with a sanitised safe filename.
   */
  validate(file: FileValidationInput): FileValidationResult {
    const threats: FileThreat[] = [];
    const maxBytes = SecurityConfig.maxFileSizeMB * 1024 * 1024;

    // ── Filename sanitisation ──
    const san = sanitizeFilename(file.originalname);
    if (san.hadTraversal) {
      threats.push({ type: "DIRECTORY_TRAVERSAL", detail: "Path traversal in filename" });
    }
    if (san.wasHidden) {
      threats.push({ type: "HIDDEN_FILE", detail: "Hidden file (leading dot)" });
    }
    if (san.hadInvalidChars) {
      threats.push({ type: "INVALID_CHARS", detail: "Invalid filename characters" });
    }

    const ext = san.safe.slice(san.safe.lastIndexOf(".")).toLowerCase();

    // ── Extension checks ──
    if (DANGEROUS_EXTS.has(ext)) {
      threats.push({ type: "EXECUTABLE", detail: `Dangerous extension: ${ext}` });
    } else if (ext === ".zip" || ext === ".tar" || ext === ".gz" || ext === ".rar" || ext === ".7z") {
      threats.push({ type: "ARCHIVE", detail: `Archive extension: ${ext}` });
    } else if (!ALLOWED_EXTS.has(ext)) {
      threats.push({ type: "UNSUPPORTED_EXT", detail: `Unsupported extension: ${ext}` });
    }

    // ── MIME checks ──
    if (DANGEROUS_MIME_PREFIXES.some((p) => file.mimetype.startsWith(p))) {
      threats.push({ type: "SCRIPT", detail: `Dangerous MIME: ${file.mimetype}` });
    } else if (!ALLOWED_MIMES.has(file.mimetype)) {
      threats.push({ type: "UNSUPPORTED_MIME", detail: `Unsupported MIME: ${file.mimetype}` });
    }

    // ── Size check ──
    if (file.size > maxBytes) {
      threats.push({
        type: "OVERSIZED",
        detail: `File size ${file.size} exceeds ${SecurityConfig.maxFileSizeMB} MB`,
      });
    }

    // ── Duplicate check ──
    if (SecurityConfig.rejectDuplicateUploads && file.existingIdentifiers) {
      const dup = file.existingIdentifiers.some(
        (e) =>
          e.name === san.safe &&
          e.size === file.size &&
          (!file.contentHash || !e.hash || e.hash === file.contentHash),
      );
      if (dup) {
        threats.push({ type: "DUPLICATE", detail: "Duplicate of an already-indexed document" });
      }
    }

    // ── Decision ──
    const blocking = threats.filter(
      (t) => t.type !== "INVALID_CHARS" && t.type !== "HIDDEN_FILE" && t.type !== "DIRECTORY_TRAVERSAL",
    );

    let decision: FileValidationResult["decision"] = "allow";
    let message: string | undefined;

    if (blocking.length > 0) {
      decision = "block";
      message = "File rejected: unsupported or unsafe file type.";
    } else if (threats.length > 0) {
      // Non-blocking issues (sanitised filename) — still allow.
      decision = "allow";
      message = "Filename was sanitised for safe storage.";
    }

    if (decision === "block") {
      logger.warn("File rejected", {
        original: file.originalname,
        threats: threats.map((t) => t.type),
      });
    }

    return {
      decision,
      safeFilename: san.safe,
      threats,
      message,
      duplicate: threats.some((t) => t.type === "DUPLICATE"),
    };
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let instance: FileValidationService | null = null;

export function getFileValidationService(): FileValidationService {
  if (!instance) instance = new FileValidationService();
  return instance;
}