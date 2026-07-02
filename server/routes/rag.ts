/**
 * RAG document ingestion endpoint.
 *
 * POST /api/rag/upload
 *
 * Accepts a PDF file via multipart/form-data, validates it, extracts text
 * and metadata using the PdfLoader, and returns a structured JSON response.
 *
 * This endpoint is intentionally standalone — it does NOT perform chunking,
 * embedding, or vector storage. Those stages are added in later phases.
 *
 * @module server/routes/rag
 */

import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { PdfLoader } from "../ai/rag/pdfLoader";
import { createLogger } from "../utils/logger";
import { ValidationError } from "../utils/errors";

const logger = createLogger("RagRoute");

// ── Multer configuration ─────────────────────────────────────────────

/**
 * Maximum upload size: 10 MB by default, overridable via
 * `RAG_MAX_UPLOAD_SIZE_MB` environment variable.
 */
const MAX_UPLOAD_SIZE_MB = parseInt(process.env.RAG_MAX_UPLOAD_SIZE_MB || "10", 10);
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new ValidationError("Only PDF files are accepted", "file"));
      return;
    }
    cb(null, true);
  },
});

// ── Router ───────────────────────────────────────────────────────────

const router = Router();

/**
 * POST /api/rag/upload
 *
 * Ingest a PDF document.
 *
 * Request:  multipart/form-data with a single "file" field.
 * Response: JSON with document metadata.
 *
 * @returns {Object} 201 JSON with documentId, filename, pageCount, textLength, status
 */
router.post(
  "/rag/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            next(
              new ValidationError(
                `File size exceeds the maximum allowed size of ${MAX_UPLOAD_SIZE_MB} MB`,
                "file",
              ),
            );
            return;
          }
          if (err.code === "LIMIT_UNEXPECTED_FILE") {
            next(new ValidationError("Only a single file is allowed", "file"));
            return;
          }
          next(new ValidationError(err.message, "file"));
          return;
        }
        next(err);
        return;
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const file = req.file;

      if (!file) {
        throw new ValidationError("No file provided. Send a PDF as the 'file' field.", "file");
      }

      logger.info(`Received PDF upload: ${file.originalname} (${file.size} bytes)`);

      // Use PdfLoader to extract text and metadata
      const loader = new PdfLoader();
      const result = await loader.load(file.buffer);

      const documentId = uuidv4();
      const pageCount = (result.metadata.pageCount as number) || 0;
      const textLength = result.content.length;

      logger.info(
        `PDF ingested: id=${documentId} filename=${file.originalname} pages=${pageCount} chars=${textLength}`,
      );

      res.status(201).json({
        documentId,
        filename: file.originalname,
        pageCount,
        textLength,
        status: "loaded",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;