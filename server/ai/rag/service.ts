/**
 * RAG Service — singleton for semantic retrieval in the chat pipeline.
 *
 * Provides a simple interface for ConversationService to retrieve
 * relevant document chunks for a given query. The service is lazily
 * initialised and fails gracefully if the vector store is unavailable.
 *
 * Supports attachment-scoped retrieval: when document IDs are provided,
 * retrieval is restricted to chunks from those documents only.
 *
 * Usage:
 * ```ts
 * const context = await ragService.retrieveContext("What is RAG?");
 * if (context) {
 *   // Inject context into messages
 * }
 * ```
 */

import { createLogger } from "../../utils/logger";
import { RagEmbeddings } from "./embeddings";
import { RagVectorStore } from "./vectorstore";
import { RagRetriever } from "./retriever";
import type { SearchResult } from "./types";

const logger = createLogger("RagService");

/**
 * Structured system instruction returned when a user asks to compare
 * documents but fewer than two active documents are available in the
 * conversation. The model must surface this to the user instead of
 * comparing against deleted or missing content.
 */
const COMPARE_INSUFFICIENT_DOCUMENTS_INSTRUCTION =
  "Only one document is currently available in this conversation. " +
  "Ask the user to attach another document before performing comparisons.";

/**
 * Phrases that indicate the user wants to compare documents.
 */
const COMPARE_PHRASES = [
  "compare documents",
  "compare resumes",
  "compare pdfs",
  "compare these",
  "compare the documents",
  "compare the two",
  "compare both",
  "compare them",
  "compare again",
  "compare available documents",
  "compare uploaded documents",
  "diff the documents",
  "difference between the documents",
];

/**
 * Formatted context string from retrieved documents.
 */
export interface RagContext {
  /** The formatted context string to inject as a system message. */
  context: string;
  /** Number of chunks retrieved. */
  chunkCount: number;
  /** Average relevance score of retrieved chunks. */
  avgScore: number;
}

/**
 * Singleton RAG service for semantic retrieval.
 *
 * Initialises the embedding generator, vector store, and retriever
 * on first use. If initialization fails, the service disables itself
 * and all subsequent retrieval attempts return null.
 */
class RagService {
  private embeddings: RagEmbeddings | null = null;
  private vectorStore: RagVectorStore | null = null;
  private retriever: RagRetriever | null = null;
  private initialized = false;
  private initError: Error | null = null;

  /**
   * Lazily initialise the RAG pipeline components.
   * Returns true if initialization succeeded, false otherwise.
   * On failure, resets state so subsequent calls can retry.
   */
  private async initialize(): Promise<boolean> {
    if (this.initialized && this.retriever !== null) {
      return true;
    }

    try {
      logger.info("Initializing RAG service...");

      // Initialize embeddings
      this.embeddings = new RagEmbeddings();
      logger.debug("RAG embeddings initialized");

      // Initialize vector store
      this.vectorStore = new RagVectorStore(this.embeddings);
      logger.debug("RAG vector store initialized");

      // Initialize retriever
      this.retriever = new RagRetriever(this.embeddings, this.vectorStore, {
        k: 4,
        scoreThreshold: 0.3,
      });
      logger.debug("RAG retriever initialized");

      this.initialized = true;
      this.initError = null;

      logger.info("RAG service initialized successfully");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to initialize RAG service: ${errorMessage}`);
      this.initError = error instanceof Error ? error : new Error(String(error));
      // Reset state so we can retry on next attempt
      this.embeddings = null;
      this.vectorStore = null;
      this.retriever = null;
      this.initialized = false;
      return false;
    }
  }

  /**
   * Retrieve relevant context for a query.
   *
   * @param query - The user's query text.
   * @returns Formatted RAG context, or null if no relevant chunks found or RAG is unavailable.
   */
  async retrieveContext(query: string): Promise<RagContext | null> {
    // Try to initialize if not already done
    if (!this.retriever) {
      const success = await this.initialize();
      if (!success) {
        logger.debug("RAG retrieval skipped: service not initialized");
        return null;
      }
    }

    if (!this.retriever) {
      return null;
    }

    try {
      logger.debug(`Retrieving context for query: "${query.slice(0, 80)}..."`);

      const results = await this.retriever.retrieve(query);

      if (results.length === 0) {
        logger.debug("No relevant chunks found");
        return null;
      }

      // Format the context
      const context = this.formatContext(results);

      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

      logger.info(
        `Retrieved ${results.length} chunks (avg score: ${avgScore.toFixed(3)})`
      );

      return {
        context,
        chunkCount: results.length,
        avgScore,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`RAG retrieval failed: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Retrieve context scoped to specific attached documents.
   *
   * Uses Chroma metadata filtering to scope the vector search to only
   * chunks from the specified documents, rather than retrieving globally
   * and filtering afterwards.
   *
   * @param query - The user's query text.
   * @param documentIds - Array of document IDs to scope retrieval to.
   * @returns Formatted RAG context, or null if no relevant chunks found.
   */
  async retrieveContextForDocuments(
    query: string,
    documentIds: string[],
  ): Promise<RagContext | null> {
    // ── Compare guard (runs BEFORE any retrieval) ───────────────────
    // Comparison requests must NEVER trigger global/unscoped retrieval.
    // If the user is asking to compare documents (resumes, PDFs, "these",
    // "again", etc.) but fewer than two active documents are available in
    // this conversation, we must NOT compare against deleted or missing
    // content. Instead we return a structured system instruction telling
    // the model to ask the user to attach another document before comparing.
    //
    // This guard is evaluated before the `documentIds.length === 0`
    // fallback below so that a comparison request with zero active
    // documents does NOT fall through to an unscoped global vector search
    // (which would otherwise leak unrelated chunks from previously indexed
    // documents).
    if (this.isCompareRequest(query)) {
      logger.info("Comparison request detected");
      logger.info(`Active document count: ${documentIds.length}`);

      if (documentIds.length < 2) {
        logger.info("Retrieval skipped due to insufficient documents");

        return {
          context: COMPARE_INSUFFICIENT_DOCUMENTS_INSTRUCTION,
          chunkCount: 0,
          avgScore: 0,
        };
      }
    }
    // ── END compare guard ───────────────────────────────────────────

    if (documentIds.length === 0) {
      return this.retrieveContext(query);
    }

    // Try to initialize if not already done
    if (!this.retriever) {
      const success = await this.initialize();
      if (!success) {
        logger.debug("Attachment-scoped RAG retrieval skipped: service not initialized");
        return null;
      }
    }

    if (!this.retriever) {
      return null;
    }

    try {
       // ── DEBUG: RagService document distribution ───────────────────────────
       logger.info("=== RagService Debug ===");
       logger.info("requested documentIds: " + documentIds.join(", "));
       // ── END DEBUG ───────────────────────────────────────────────────────────

       // Log the exact attachment array
       logger.info(`Requested docs:`);
       for (const id of documentIds) {
         logger.info(`  - ${id}`);
       }

       // Retrieve with document ID filtering passed to the retriever
       // The retriever will pass the filter to the vector store for Chroma metadata filtering
       const results = await this.retriever.retrieve(query, documentIds);

       // Log every chunk with metadata
       logger.info(`Retrieved chunks:`);
       for (let i = 0; i < results.length; i++) {
         const r = results[i];
         const chunkDocId = r.document.metadata?.documentId as string | undefined;
         const chunkFilename = r.document.metadata?.filename as string | undefined;
         logger.info(
           `  ${chunkFilename ?? "unknown"} -> documentId=${chunkDocId ?? "undefined"}, score=${r.score.toFixed(4)}`
         );
       }

       // Log combined retrieval
       const docChunks = new Map<string, number>();
       for (const r of results) {
         const filename = r.document.metadata?.filename as string | undefined;
         if (filename) {
           docChunks.set(filename, (docChunks.get(filename) || 0) + 1);
         }
       }
       logger.info(`Combined retrieval: ${results.length} chunks total`);
       for (const [filename, count] of docChunks) {
         logger.info(`  ${filename} -> ${count} chunks`);
       }

      if (results.length === 0) {
        logger.debug("No relevant chunks found in attached documents");
        return null;
      }

      // Format the context
      const context = this.formatContext(results);

      // ── DEBUG: Log the actual RAG context content ───────────────────────────────
      logger.info("RAG context content preview: " + context.substring(0, 500) + "...");
      // ── END DEBUG ───────────────────────────────────────────────────────────

      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

      logger.info(
        `Retrieved ${results.length} chunks from attachment scope ` +
        `(avg score: ${avgScore.toFixed(3)})`,
      );

      return {
        context,
        chunkCount: results.length,
        avgScore,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Attachment-scoped RAG retrieval failed: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Determine whether a user query is asking to compare documents.
   *
   * Matches explicit comparison phrases such as "compare documents",
   * "compare resumes", "compare PDFs", and "compare these". This is used
   * to gate attachment-scoped retrieval so the model never compares
   * against deleted or missing document content.
   *
   * @param query - The user's query text.
   * @returns true if the query is a comparison request.
   */
  private isCompareRequest(query: string): boolean {
    const normalized = query.toLowerCase();
    return COMPARE_PHRASES.some((phrase) => normalized.includes(phrase));
  }

  /**
   * Format retrieved search results into a system message context.
   *
   * @param results - Array of search results from the retriever.
   * @returns Formatted context string.
   */
  private formatContext(results: SearchResult[]): string {
    const parts: string[] = [
      "The content below comes directly from documents attached by the user. " +
      "The assistant has full access to those documents and can reference them freely. " +
      "When the user says \"this document\", \"attached file\", \"attached PDF\", \"these documents\", " +
      "or \"my resume\", they are referring to the attached content below. " +
      "The assistant must never claim it cannot access the document, does not have access to the PDF, " +
      "or that the document was not provided if relevant context exists below. " +
      "If multiple documents are attached, treat all retrieved chunks as belonging to those documents " +
      "and comparisons between them are allowed.",
      "",
      "Retrieved Context:",
    ];

    results.forEach((result, index) => {
      const { document, score } = result;
      const metadata = document.metadata || {};

      parts.push(`[${index + 1}] (Relevance: ${(score * 100).toFixed(1)}%)`);
      parts.push(document.pageContent);
      parts.push("");
    });

    return parts.join("\n");
  }

  /**
   * Check if the RAG service is initialized and available.
   * Performs a lightweight connectivity check to verify ChromaDB is reachable.
   * This check is always dynamic — it never caches results.
   *
   * @returns true if the service is initialized and ChromaDB is reachable
   */
  async isAvailable(): Promise<boolean> {
    // If not initialized, try to initialize
    if (!this.retriever) {
      const success = await this.initialize();
      if (!success) {
        return false;
      }
    }

    // If still no retriever, not available
    if (!this.retriever) {
      return false;
    }

    // Perform lightweight connectivity check (no caching)
    try {
      return await this.vectorStore!.isHealthy();
    } catch (error) {
      logger.debug(`Health check failed: ${error}`);
      return false;
    }
  }

  /**
   * Check if the retriever is ready (initialized and functional).
   * This is a lightweight check that does NOT perform any semantic search.
   * It only verifies that the pipeline components are initialized.
   *
   * @returns true if the retriever is initialized and ready for queries
   */
  async isRetrieverReady(): Promise<boolean> {
    // If not initialized, try to initialize
    if (!this.retriever) {
      const success = await this.initialize();
      if (!success) {
        return false;
      }
    }

    return this.retriever !== null;
  }

  /**
   * Reset the RAG service (useful for testing or reinitialization).
   * Clears the Chroma collection and reinitializes components.
   */
  async reset(): Promise<void> {
    try {
      // Delete all documents from the Chroma collection if vector store exists
      if (this.vectorStore) {
        logger.info("Deleting all documents from Chroma collection...");
        await this.vectorStore.deleteAll();
        logger.info("Chroma collection cleared successfully");
      } else {
        logger.warn("RagService.reset() called but vectorStore is null - nothing to reset");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.warn(`Failed to clear Chroma collection: ${errorMessage}`);
    } finally {
      // Clear in-memory references
      this.embeddings = null;
      this.vectorStore = null;
      this.retriever = null;
      this.initialized = false;
      this.initError = null;
      logger.debug("RAG service reset complete");
    }
  }
}

// Export singleton instance
export const ragService = new RagService();