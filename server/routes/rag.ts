/**
 * RAG document ingestion endpoint.
 *
 * POST /api/rag/upload
 *
 * Accepts a PDF file via multipart/form-data, validates it, extracts text
 * and metadata using the PdfLoader, then runs the full indexing pipeline:
 *
 *   Extract Text → Split into Chunks → Generate Embeddings → Store in ChromaDB
 *
 * Returns a structured JSON response with indexing statistics.
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
import { ValidationError } from "../utils/errors";
import type { RagDocument } from "../ai/rag/types";

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
 * Ingest a PDF document and index it into the vector store.
 *
 * Pipeline:
 *   1. Validate and load the PDF via PdfLoader
 *   2. Split the extracted text into chunks via RagSplitter
 *   3. Generate embeddings for each chunk via RagEmbeddings
 *   4. Store chunks + embeddings in ChromaDB via RagVectorStore
 *   5. Return indexing statistics
 *
 * Request:  multipart/form-data with a single "file" field.
 * Response: JSON with documentId, filename, pageCount, textLength, chunkCount, status
 */
router.post(
  "/rag/upload",
  (req, res, next) => {
    // Existing upload endpoint
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

      // ── Step 1: Extract text via PdfLoader ────────────────────────
      const loader = new PdfLoader();
      const result = await loader.load(file.buffer);

      const documentId = uuidv4();
      const pageCount = (result.metadata.pageCount as number) || 0;
      const textLength = result.content.length;

      logger.info(
        `PDF extracted: id=${documentId} filename=${file.originalname} pages=${pageCount} chars=${textLength}`,
      );

      // ── Step 2: Split into chunks via RagSplitter ─────────────────
      const splitter = new RagSplitter();
      const chunks = await splitter.splitText(result.content, {
        documentId,
        filename: file.originalname,
      });

      // Add chunk index metadata to each chunk
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

      // ── Step 3 & 4: Generate embeddings and store in ChromaDB ────
      const embeddings = new RagEmbeddings();
      const vectorStore = new RagVectorStore(embeddings);

      logger.info(`[INSTRUMENT] Indexing route: embeddings instance created, vectorStore instance created`);
      logger.info(`[INSTRUMENT] About to add ${totalChunks} documents to collection`);

      await vectorStore.addDocuments(indexedChunks);

      logger.info(
        `Indexed ${totalChunks} chunks for document ${documentId} in ChromaDB`,
      );
      logger.info(`[INSTRUMENT] Indexing complete for document ${documentId}`);

      // ── Step 5: Return indexing statistics ────────────────────────
      res.status(201).json({
        documentId,
        filename: file.originalname,
        pageCount,
        textLength,
        chunkCount: totalChunks,
        status: "indexed",
      });
    } catch (error) {
      next(error);
    }
  },
);
 
 /**
  * POST /api/rag/search
  *
  * Perform a semantic search over indexed documents.
  *
  * Request body: { query: string, k?: number }
  * Response: {
  *   results: Array<{
  *     content: string;
  *     score: number;
  *     metadata: {
  *       documentId: string;
  *       filename: string;
  *       chunkIndex: number;
  *       totalChunks: number;
  *     };
  *   }>;
  * }
  *
  * No LLM calls are made; embeddings are generated via RagEmbeddings and
  * similarity is computed by RagVectorStore.
  */
  router.post(
    "/rag/search",
    async (req, res, next) => {
      try {
        const { query, k = 5 } = req.body as { query: string; k?: number };
  
        if (!query || typeof query !== "string") {
          throw new ValidationError("Query must be a non‑empty string", "query");
        }
  
        logger.info(`[TRACE 1] Request received: query="${query.slice(0, 80)}...", k=${k}`);
        logger.info(`[TRACE 2] Query text extracted successfully`);
  
         // Initialize retriever (reuse existing components)
         const embeddings = new RagEmbeddings();
         const vectorStore = new RagVectorStore(embeddings);
         const retriever = new RagRetriever(embeddings, vectorStore);
         
         logger.info(`[INSTRUMENT] Search route: embeddings instance created, vectorStore instance created`);
         logger.info(`[TRACE 3] RagService components initialized (embeddings, vectorStore, retriever)`);
         logger.info(`[INSTRUMENT] About to search with query: "${query.slice(0, 80)}..."`);
   
         // Perform retrieval
         const docs = await retriever.retrieve(query);
         
         logger.info(`[INSTRUMENT] Search complete, retrieved ${docs.length} documents`);
         logger.info(`[TRACE 6] Retriever returned ${docs.length} documents`);
  
        // Map to response format
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
  
        logger.info(`[TRACE 7] Route returning ${results.length} results`);
        res.json({ results });
      } catch (error) {
        logger.error(`[TRACE ERROR] Error in search route: ${error}`);
        next(error);
      }
    },
  );
 
 export default router;
