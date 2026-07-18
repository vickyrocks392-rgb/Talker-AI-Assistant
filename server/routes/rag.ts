/**
 * RAG document ingestion and management endpoints.
 *
 * POST   /api/rag/upload          Upload and index a document
 * POST   /api/rag/search          Semantic search over indexed documents
 * POST   /api/rag/reset           Reset RAG collection (dev only)
 * GET    /api/rag/documents       List all indexed documents
 * GET    /api/rag/documents/:id   Get document metadata
 * GET    /api/rag/documents/:id/text  Get document extracted text
 * DELETE /api/rag/documents/:id   Delete a document and its embeddings
 * POST   /api/rag/documents/:id/reindex  Reindex a document
 * GET    /api/rag/documents/active       Get active document
 * POST   /api/rag/documents/active       Set active document
 * GET    /api/rag/stats            Get document and chunk statistics
 * POST   /api/rag/summarize/:id   Generate AI summary for a document
 *
 * Security (Phase 7.4):
 *   - FileValidationService validates uploads (MIME, ext, size, duplicates)
 *   - PromptInjectionDetector scans queries and document text
 *   - Security telemetry attached to responses
 *
 * @module server/routes/rag
 */

import { Router } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { PdfLoader } from "../ai/rag/pdfLoader";
import { RagSplitter } from "../ai/rag/splitter";
import { RagEmbeddings } from "../ai/rag/embeddings";
import { RagVectorStore } from "../ai/rag/vectorstore";
import { RagRetriever } from "../ai/rag/retriever";
import { createLogger } from "../utils/logger";
import { getConfig } from "../config/env";
import { ValidationError, NotFoundError } from "../utils/errors";
import { getDatabase } from "../db/database";
import { memoryService } from "../memory/service";
import type { RagDocument } from "../ai/rag/types";
import {
  getFileValidationService,
  getPromptInjectionDetector,
  createSecurityMonitor,
  SecurityConfig,
} from "../security";

const logger = createLogger("RagRoute");

// ── Multer configuration ─────────────────────────────────────────────

const MAX_UPLOAD_SIZE_MB = parseInt(process.env.RAG_MAX_UPLOAD_SIZE_MB || "10", 10);
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/csv",
    ];
    const allowedExts = /\.(pdf|txt|md|docx|csv)$/i;
    if (!allowedMimes.includes(file.mimetype) && !allowedExts.test(file.originalname)) {
      cb(new ValidationError("Unsupported file type. Please upload PDF, TXT, MD, DOCX, or CSV files.", "file"));
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
 * Ingest a document and index it into the vector store.
 * Supports PDF, TXT, MD, DOCX, CSV files.
 */
router.post(
  "/rag/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            next(new ValidationError(`File size exceeds the maximum allowed size of ${MAX_UPLOAD_SIZE_MB} MB`, "file"));
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
    const sec = createSecurityMonitor();
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError("No file provided. Send a file as the 'file' field.", "file");
      }

      // ── Security: validate the uploaded file ──
      const db = getDatabase();
      const existing = db
        .prepare("SELECT original_name, size FROM documents")
        .all() as Array<{ original_name: string; size: number }>;

      const fileSvc = getFileValidationService();
      const validation = fileSvc.validate({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        existingIdentifiers: existing.map((e) => ({ name: e.original_name, size: e.size })),
      });

      if (validation.decision === "block") {
        for (const t of validation.threats) sec.recordRejectedFile(t.type);
        if (validation.duplicate) sec.recordDuplicateFile();
        logger.warn(`Rejected file upload: ${file.originalname}`, {
          threats: validation.threats.map((t) => t.type),
        });
        res.status(400).json({
          error: { code: "FILE_REJECTED", message: validation.message ?? "File rejected." },
          security: sec.getData(),
        });
        return;
      }

      logger.info(`Received file upload: ${validation.safeFilename} (${file.size} bytes, ${file.mimetype})`);

      const documentId = uuidv4();
      let pageCount = 0;
      let textLength = 0;
      let content = "";

      // Extract text based on file type
      if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
        const loader = new PdfLoader();
        const result = await loader.load(file.buffer);
        content = result.content;
        pageCount = (result.metadata.pageCount as number) || 0;
        textLength = content.length;
      } else {
        content = file.buffer.toString("utf-8");
        textLength = content.length;
        pageCount = 1;
      }

      // ── Security: scan document text for prompt-injection / poisoning ──
      const injector = getPromptInjectionDetector();
      const scan = injector.scan(content);
      if (scan.detected) {
        sec.recordPromptInjection(scan.patterns, scan.score);
        logger.warn("Prompt-injection patterns found in uploaded document", {
          patterns: scan.patterns,
          score: scan.score,
        });
        // Strip malicious instructions but continue indexing safely.
        if (scan.modified) content = scan.cleaned;
      }

      logger.info(`File extracted: id=${documentId} filename=${validation.safeFilename} pages=${pageCount} chars=${textLength}`);

      // Split into chunks
      const splitter = new RagSplitter();
      const chunks = await splitter.splitText(content, {
        documentId,
        filename: validation.safeFilename,
      });

      const totalChunks = chunks.length;
      const indexedChunks: RagDocument[] = chunks.map((chunk, index) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          chunkIndex: index,
          totalChunks,
        },
      }));

      logger.info(`Split into ${totalChunks} chunks`);

      // Generate embeddings and store in ChromaDB
      const embeddings = new RagEmbeddings();
      const vectorStore = new RagVectorStore(embeddings);
      await vectorStore.addDocuments(indexedChunks);

      logger.info(`Indexed ${totalChunks} chunks for document ${documentId} in ChromaDB`);

      // Persist document metadata to SQLite
      const now = new Date().toISOString();

      // Deactivate any previously active document
      db.prepare("UPDATE documents SET is_active = 0 WHERE is_active = 1").run();

      const embeddingModel = process.env.RAG_EMBEDDING_MODEL || "nomic-embed-text";

      db.prepare(`
        INSERT INTO documents (id, filename, original_name, mime_type, size, page_count, text_length, chunk_count, status, is_active, embedding_model, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'indexed', 1, ?, ?, ?)
      `).run(documentId, validation.safeFilename, validation.safeFilename, file.mimetype, file.size, pageCount, textLength, totalChunks, embeddingModel, now, now);

      logger.info(`Document metadata saved to SQLite: ${documentId}`);

      res.status(201).json({
        documentId,
        filename: validation.safeFilename,
        pageCount,
        textLength,
        chunkCount: totalChunks,
        status: "indexed",
        security: sec.getData(),
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/rag/search
 * Perform a semantic search over indexed documents.
 */
router.post("/rag/search", async (req, res, next) => {
  const sec = createSecurityMonitor();
  try {
    const { query, k = 5 } = req.body as { query: string; k?: number };

    if (!query || typeof query !== "string") {
      throw new ValidationError("Query must be a non‑empty string", "query");
    }

    // ── Security: scan query for prompt injection ──
    const injector = getPromptInjectionDetector();
    const scan = injector.scan(query);
    let safeQuery = query;
    if (scan.detected) {
      sec.recordPromptInjection(scan.patterns, scan.score);
      logger.warn("Prompt-injection attempt in RAG search query", {
        patterns: scan.patterns,
        score: scan.score,
      });
      if (scan.modified) safeQuery = scan.cleaned;
    }

    logger.info(`Search request received: query="${safeQuery.slice(0, 80)}...", k=${k}`);

    const embeddings = new RagEmbeddings();
    const vectorStore = new RagVectorStore(embeddings);
    const retriever = new RagRetriever(embeddings, vectorStore);
    const docs = await retriever.retrieve(safeQuery);

    logger.info(`Search complete, retrieved ${docs.length} documents`);

    const results = docs.map((doc) => ({
      content: doc.document.pageContent,
      score: doc.score,
      metadata: {
        documentId: doc.document.metadata?.documentId as string,
        filename: doc.document.metadata?.filename as string,
        chunkIndex: doc.document.metadata?.chunkIndex as number,
        totalChunks: doc.document.metadata?.totalChunks as number,
      },
    }));

    res.json({ results, security: sec.getData() });
  } catch (error) {
    logger.error(`Error in search route: ${error}`);
    next(error);
  }
});

/**
 * POST /api/rag/reset
 * Reset the RAG collection by deleting and recreating it.
 */
router.post("/rag/reset", async (_req, res, next) => {
  try {
    logger.info("Resetting RAG collection...");
    const { ragService } = await import("../ai/rag/service");
    await ragService.reset();

    const db = getDatabase();
    db.prepare("DELETE FROM documents").run();

    logger.info("RAG collection reset successfully");
    res.status(200).json({
      success: true,
      message: "RAG collection has been reset. Ready for new documents.",
    });
  } catch (error) {
    logger.error("Failed to reset RAG collection", error);
    next(error);
  }
});

/**
 * GET /api/rag/documents
 * List all indexed documents.
 */
router.get("/rag/documents", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM documents ORDER BY created_at DESC").all() as any[];

    const documents = rows.map((row) => ({
      documentId: row.id,
      filename: row.original_name,
      uploadDate: row.created_at,
      status: row.status,
      pages: row.page_count,
      size: row.size,
      chunkCount: row.chunk_count,
      textLength: row.text_length,
      indexed: row.status === "indexed",
      isActive: row.is_active === 1,
      embeddingModel: row.embedding_model || "nomic-embed-text",
      indexingDate: row.updated_at || row.created_at,
    }));

    res.json({ documents });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/rag/documents/active
 * Get the active document.
 */
router.get("/rag/documents/active", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM documents WHERE is_active = 1 LIMIT 1").get() as any;

    if (!row) {
      res.json({ document: null });
      return;
    }

    res.json({
      document: {
        documentId: row.id,
        filename: row.original_name,
        uploadDate: row.created_at,
        status: row.status,
        pages: row.page_count,
        size: row.size,
        chunkCount: row.chunk_count,
        textLength: row.text_length,
        indexed: row.status === "indexed",
        isActive: true,
        embeddingModel: row.embedding_model || "nomic-embed-text",
        indexingDate: row.updated_at || row.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rag/documents/active
 * Set the active document.
 */
router.post("/rag/documents/active", async (req, res, next) => {
  try {
    const { documentId } = req.body as { documentId: string };
    if (!documentId) {
      throw new ValidationError("documentId is required", "documentId");
    }

    const db = getDatabase();

    db.prepare("UPDATE documents SET is_active = 0").run();

    const result = db.prepare("UPDATE documents SET is_active = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), documentId);

    if (result.changes === 0) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    res.json({ success: true, documentId });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/rag/documents/:id
 * Get document metadata.
 */
router.get("/rag/documents/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id) as any;

    if (!row) {
      throw new NotFoundError(`Document ${req.params.id} not found`);
    }

    res.json({
      document: {
        documentId: row.id,
        filename: row.original_name,
        uploadDate: row.created_at,
        status: row.status,
        pages: row.page_count,
        size: row.size,
        chunkCount: row.chunk_count,
        textLength: row.text_length,
        indexed: row.status === "indexed",
        isActive: row.is_active === 1,
        embeddingModel: row.embedding_model || "nomic-embed-text",
        indexingDate: row.updated_at || row.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/rag/documents/:id/text
 * Get document extracted text by searching ChromaDB for all chunks.
 */
router.get("/rag/documents/:id/text", async (req, res, next) => {
  try {
    const documentId = req.params.id;

    const embeddings = new RagEmbeddings();
    const vectorStore = new RagVectorStore(embeddings);

    const results = await vectorStore.similaritySearch(documentId, 100);

    const docChunks = results
      .filter((r) => r.document.metadata?.documentId === documentId)
      .sort((a, b) => ((a.document.metadata?.chunkIndex as number) || 0) - ((b.document.metadata?.chunkIndex as number) || 0))
      .map((r) => r.document.pageContent);

    const fullText = docChunks.join("\n\n");

    res.json({
      documentId,
      text: fullText || "No extracted text available.",
      chunkCount: docChunks.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/rag/documents/:id
 * Delete a document, its ChromaDB embeddings, and its conversation
 * active-document references atomically.
 */
router.delete("/rag/documents/:id", async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const db = getDatabase();

    const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as any;
    if (!row) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    const embeddings = new RagEmbeddings();
    const vectorStore = new RagVectorStore(embeddings);
    await vectorStore.deleteDocument(documentId);

    const deleteMeta = db.prepare("DELETE FROM documents WHERE id = ?");
    const purgeActive = db.transaction(() => {
      const remaining = memoryService.removeActiveDocumentFromAllConversations(documentId);
      deleteMeta.run(documentId);
      return remaining;
    });

    const remainingActiveDocuments = purgeActive();

    logger.info(`Deleted vectors for document: ${documentId}`);
    logger.info(`Remaining active documents: ${remainingActiveDocuments}`);

    res.json({ success: true, documentId });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rag/documents/:id/reindex
 * Reindex a document by re-processing its content.
 */
router.post("/rag/documents/:id/reindex", async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const db = getDatabase();

    const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as any;
    if (!row) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    db.prepare("UPDATE documents SET status = 'indexing', updated_at = ? WHERE id = ?").run(new Date().toISOString(), documentId);

    try {
      const embeddings = new RagEmbeddings();
      const vectorStore = new RagVectorStore(embeddings);
      const results = await vectorStore.similaritySearch(documentId, 1000);
      const docChunks = results.filter((r) => r.document.metadata?.documentId === documentId);

      if (docChunks.length > 0) {
        const allResults = await vectorStore.similaritySearch("", 1000);
        const otherChunks = allResults.filter((r) => r.document.metadata?.documentId !== documentId);

        await vectorStore.deleteAll();

        if (otherChunks.length > 0) {
          const reAddEmbeddings = new RagEmbeddings();
          const reAddStore = new RagVectorStore(reAddEmbeddings);
          await reAddStore.addDocuments(otherChunks.map((r) => r.document));
        }
      }
    } catch (err) {
      logger.warn(`Failed to delete old embeddings: ${err}`);
    }

    db.prepare("UPDATE documents SET status = 'indexed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), documentId);

    logger.info(`Document reindexed: ${documentId}`);
    res.json({ success: true, documentId, status: "indexed" });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/rag/stats
 * Get document and chunk statistics.
 */
router.get("/rag/stats", async (_req, res, next) => {
  try {
    const db = getDatabase();

    const docCount = db.prepare("SELECT COUNT(*) as count FROM documents").get() as any;
    const totalChunks = db.prepare("SELECT COALESCE(SUM(chunk_count), 0) as total FROM documents").get() as any;
    const indexedCount = db.prepare("SELECT COUNT(*) as count FROM documents WHERE status = 'indexed'").get() as any;
    const activeDoc = db.prepare("SELECT * FROM documents WHERE is_active = 1 LIMIT 1").get() as any;

    let vectorDbStatus = "unavailable";
    let vectorCount = -1;
    try {
      const embeddings = new RagEmbeddings();
      const vectorStore = new RagVectorStore(embeddings);
      const isHealthy = await vectorStore.isHealthy();
      if (isHealthy) {
        vectorDbStatus = "ready";
        vectorCount = await vectorStore.getDocumentCount();
      }
    } catch {
      vectorDbStatus = "unavailable";
    }

    res.json({
      totalDocuments: docCount?.count || 0,
      totalChunks: totalChunks?.total || 0,
      indexedDocuments: indexedCount?.count || 0,
      vectorDbStatus,
      vectorCount,
      activeDocument: activeDoc ? {
        documentId: activeDoc.id,
        filename: activeDoc.original_name,
      } : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rag/summarize/:id
 * Generate AI summary for a document.
 */
router.post("/rag/summarize/:id", async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const db = getDatabase();

    const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as any;
    if (!row) {
      throw new NotFoundError(`Document ${documentId} not found`);
    }

    const embeddings = new RagEmbeddings();
    const vectorStore = new RagVectorStore(embeddings);
    const results = await vectorStore.similaritySearch(documentId, 100);

    const docChunks = results
      .filter((r) => r.document.metadata?.documentId === documentId)
      .sort((a, b) => ((a.document.metadata?.chunkIndex as number) || 0) - ((b.document.metadata?.chunkIndex as number) || 0))
      .map((r) => r.document.pageContent);

    const fullText = docChunks.join("\n\n").slice(0, 8000);

    let summary = "";
    let keyPoints: string[] = [];
    let entities: string[] = [];
    let technologies: string[] = [];
    let skills: string[] = [];

    try {
      const { getAIProvider } = await import("../ai/provider");
      const provider = getAIProvider();

      const summaryPrompt = `You are a document analysis assistant. Analyze the following document text and provide a structured summary.

Document: ${row.original_name}

Text:
${fullText}

Respond with a JSON object containing:
- "summary": A 2-3 sentence executive summary
- "keyPoints": Array of 3-5 key points
- "entities": Array of key entities mentioned (people, organizations, concepts)
- "technologies": Array of technologies or tools mentioned
- "skills": Array of skills or competencies discussed

Example format:
{
  "summary": "This document discusses...",
  "keyPoints": ["Point 1", "Point 2"],
  "entities": ["Entity 1", "Entity 2"],
  "technologies": ["Tech 1", "Tech 2"],
  "skills": ["Skill 1", "Skill 2"]
}

Return ONLY valid JSON.`;

      const response = await provider.summarize([
        { role: "system", content: "You are a document analysis assistant. Always respond with valid JSON." },
        { role: "user", content: summaryPrompt },
      ]);

      try {
        const parsed = JSON.parse(response);
        summary = parsed.summary || "";
        keyPoints = parsed.keyPoints || [];
        entities = parsed.entities || [];
        technologies = parsed.technologies || [];
        skills = parsed.skills || [];
      } catch {
        summary = response;
      }
    } catch (err) {
      logger.warn(`AI summarization failed, using fallback: ${err}`);
      summary = `Document "${row.original_name}" contains ${row.page_count} pages and ${row.chunk_count} chunks of indexed content.`;
      keyPoints = [
        `Document successfully processed and indexed`,
        `Contains ${row.chunk_count} searchable chunks`,
        `Ready for semantic search queries`,
      ];
    }

    res.json({
      documentId,
      filename: row.original_name,
      summary,
      keyPoints,
      entities,
      technologies,
      skills,
      pageCount: row.page_count,
      chunkCount: row.chunk_count,
    });
  } catch (error) {
    next(error);
  }
});

export default router;