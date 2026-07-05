/**
 * RAG Service — singleton for semantic retrieval in the chat pipeline.
 *
 * Provides a simple interface for ConversationService to retrieve
 * relevant document chunks for a given query. The service is lazily
 * initialised and fails gracefully if the vector store is unavailable.
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
  private lastHealthCheck: boolean | null = null;

  /**
   * Lazily initialise the RAG pipeline components.
   * Returns true if initialization succeeded, false otherwise.
   */
  private async initialize(): Promise<boolean> {
    if (this.initialized) {
      return this.retriever !== null;
    }

    this.initialized = true;

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

      logger.info("RAG service initialized successfully");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to initialize RAG service: ${errorMessage}`);
      this.initError = error instanceof Error ? error : new Error(String(error));
      this.embeddings = null;
      this.vectorStore = null;
      this.retriever = null;
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
   * Format retrieved search results into a system message context.
   *
   * @param results - Array of search results from the retriever.
   * @returns Formatted context string.
   */
  private formatContext(results: SearchResult[]): string {
    const parts: string[] = [
      "The following information is retrieved from the user's uploaded documents. " +
      "Use this information to answer the user's question accurately. " +
      "If the information is not relevant to the question, ignore it and answer normally.",
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
   *
   * @returns true if the service is initialized and ChromaDB is reachable
   */
  async isAvailable(): Promise<boolean> {
    // If we have a cached health check result, use it
    if (this.lastHealthCheck !== null) {
      return this.lastHealthCheck;
    }

    // If not initialized, try to initialize
    if (!this.retriever) {
      const success = await this.initialize();
      if (!success) {
        this.lastHealthCheck = false;
        return false;
      }
    }

    // If still no retriever, not available
    if (!this.retriever) {
      this.lastHealthCheck = false;
      return false;
    }

    // Perform lightweight connectivity check
    try {
      const isHealthy = await this.vectorStore!.isHealthy();
      this.lastHealthCheck = isHealthy;
      return isHealthy;
    } catch (error) {
      logger.debug(`Health check failed: ${error}`);
      this.lastHealthCheck = false;
      return false;
    }
  }

  /**
   * Reset the cached health check status.
   * Called after initialization or reset to force a fresh health check.
   */
  private resetHealthCheck(): void {
    this.lastHealthCheck = null;
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
      this.resetHealthCheck();
      logger.debug("RAG service reset complete");
    }
  }
}

// Export singleton instance
export const ragService = new RagService();