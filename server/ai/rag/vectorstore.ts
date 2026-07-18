/**
 * Vector store for the RAG pipeline.
 *
 * Uses LangChain's Chroma vector store integration to persist document
 * embeddings and enable similarity search. The implementation is wrapped
 * behind the `VectorStore` interface so the underlying store (Chroma,
 * Pinecone, Qdrant, etc.) can be swapped without changing the pipeline.
 *
 * ChromaDB runs as a client-server instance. The connection target is
 * resolved from the central AppConfig (which reads CHROMA_HOST, CHROMA_PORT,
 * CHROMA_SSL, and CHROMA_COLLECTION from the environment), falling back to
 * localhost:8000 without SSL for local development.
 *
 * In production, all Chroma configuration must be provided via environment
 * variables. Missing configuration produces a warning but does not crash
 * the application — the vector store will fail gracefully on first use.
 */

import { Chroma } from "@langchain/community/vectorstores/chroma";
import { createLogger } from "../../utils/logger";
import { getConfig } from "../../config/env";
import type { RagDocument, SearchResult, VectorStoreConfig, VectorStore } from "./types";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";

const logger = createLogger("RagVectorStore");

/**
 * Default configuration for the Chroma vector store.
 * These values are used when no config is passed and no env vars are set.
 */
const DEFAULT_VECTORSTORE_CONFIG: Required<VectorStoreConfig> = {
  collectionName: "talker_rag",
  host: "localhost",
  port: 8000,
  ssl: false,
  dimensions: 768,
};

/**
 * Vector store implementation using ChromaDB via LangChain.
 *
 * Manages a Chroma collection for storing and querying document embeddings.
 * The store is lazily initialised — the Chroma collection is created on
 * the first `addDocuments` or `similaritySearch` call.
 *
 * Configuration resolution order (highest priority first):
 *   1. Explicit `config` argument passed to constructor
 *   2. Environment variables (CHROMA_HOST, CHROMA_PORT, CHROMA_SSL, CHROMA_COLLECTION)
 *   3. DEFAULT_VECTORSTORE_CONFIG hardcoded defaults
 *
 * @implements {VectorStore}
 */
export class RagVectorStore implements VectorStore {
  private config: Required<VectorStoreConfig>;
  private embeddings: EmbeddingsInterface;
  private store: Chroma | null = null;

  constructor(embeddings: EmbeddingsInterface, config?: Partial<VectorStoreConfig>) {
    // Resolve Chroma configuration from the central config (env vars) first,
    // then allow explicit overrides via the config argument.
    const appConfig = getConfig();
    const envHost = appConfig.chroma.host;
    const envPort = appConfig.chroma.port;
    const envSsl = appConfig.chroma.ssl;
    const envCollection = appConfig.chroma.collectionName;

    // Detect if the user has explicitly set any Chroma env vars.
    // If CHROMA_HOST is set (and is not "localhost"), we assume production config.
    const hasExplicitChromaConfig = !!(
      process.env.CHROMA_HOST ||
      process.env.CHROMA_PORT ||
      process.env.CHROMA_SSL ||
      process.env.CHROMA_COLLECTION
    );

    // Merge: env vars → defaults, then explicit config overrides all
    this.config = {
      ...DEFAULT_VECTORSTORE_CONFIG,
      host: envHost,
      port: envPort,
      ssl: envSsl,
      collectionName: envCollection,
      ...config,
    };
    this.embeddings = embeddings;

    // Build the connection URL based on SSL setting
    const protocol = this.config.ssl ? "https" : "http";
    const chromaUrl = `${protocol}://${this.config.host}:${this.config.port}`;

    // Log which configuration mode is active
    if (hasExplicitChromaConfig) {
      logger.info(`Chroma configuration: environment (CHROMA_HOST=${this.config.host}, CHROMA_PORT=${this.config.port}, CHROMA_SSL=${this.config.ssl})`);
    } else if (config) {
      logger.info(`Chroma configuration: explicit (host=${this.config.host}, port=${this.config.port}, ssl=${this.config.ssl})`);
    } else {
      logger.info(`Chroma configuration: defaults (host=${this.config.host}, port=${this.config.port}, ssl=${this.config.ssl})`);
    }

    logger.info(`Chroma URL: ${chromaUrl}`);
    logger.info(`Chroma collection: ${this.config.collectionName}`);

    // Warn if running in production with default localhost config
    if (appConfig.server.isProduction && !hasExplicitChromaConfig) {
      logger.warn(
        "PRODUCTION DETECTED: ChromaDB is configured with default localhost settings. " +
        "Set CHROMA_HOST, CHROMA_PORT, CHROMA_SSL, and CHROMA_COLLECTION environment variables " +
        "to point to your production ChromaDB instance.",
      );
    }

    logger.debug(
      `Initialized vector store: collection=${this.config.collectionName}, dimensions=${this.config.dimensions}`,
    );
  }

  /**
   * Lazily initialise the underlying Chroma store.
   * Creates or retrieves the collection on first access.
   */
  private async getStore(): Promise<Chroma> {
    if (!this.store) {
      logger.debug(`Creating Chroma collection: ${this.config.collectionName}`);

      // Build the connection URL respecting the SSL setting.
      // In production with CHROMA_SSL=true, this will use https://.
      const protocol = this.config.ssl ? "https" : "http";
      const chromaUrl = `${protocol}://${this.config.host}:${this.config.port}`;

      this.store = new Chroma(this.embeddings, {
        url: chromaUrl,
        collectionName: this.config.collectionName,
        numDimensions: this.config.dimensions,
      });

      // Ensure the collection exists
      await this.store.ensureCollection();

      logger.debug(`Chroma collection ready: ${this.config.collectionName}`);
    }

    return this.store;
  }

  /**
   * Get the current document count in the collection.
   * This is a public method for verification and debugging.
   */
  async getDocumentCount(): Promise<number> {
    try {
      const store = await this.getStore();
      const collection = await store.ensureCollection();
      return await collection.count();
    } catch (error) {
      logger.debug(`Could not get document count: ${error}`);
      return -1;
    }
  }

  /**
   * Perform a lightweight health check to verify ChromaDB connectivity.
   * This attempts to access the collection without performing an expensive operation.
   *
   * @returns true if ChromaDB is reachable, false otherwise
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Lightweight check: just try to get the store and count documents
      // This verifies the connection without expensive operations
      const count = await this.getDocumentCount();
      return count >= 0; // getDocumentCount returns -1 on error
    } catch (error) {
      logger.debug(`ChromaDB health check failed: ${error}`);
      return false;
    }
  }

  /**
   * Add documents with their embeddings to the store.
   *
   * @param documents - Array of document chunks to add.
   */
  async addDocuments(documents: RagDocument[]): Promise<void> {
    logger.debug(`Adding ${documents.length} documents to vector store`);

    const store = await this.getStore();
    
    // Log first document metadata before insertion
    if (documents.length > 0) {
      logger.debug(`Chunk metadata inserted: ${JSON.stringify(documents[0].metadata)}`);
    }
    
    await store.addDocuments(documents);
    
    // Verify insertion by searching WITHOUT filter first to get all results
    if (documents.length > 0) {
      const docId = documents[0].metadata?.documentId as string | undefined;
      if (docId) {
        try {
          // First, search without filter to see what's actually stored
          const unfilteredResults = await store.similaritySearch(documents[0].pageContent.slice(0, 50), 3);
          
          if (unfilteredResults.length > 0) {
            logger.debug(`Verification: Retrieved ${unfilteredResults.length} chunks without filter`);
            logger.debug(`First chunk metadata as stored in Chroma: ${JSON.stringify(unfilteredResults[0].metadata)}`);
            logger.debug(`Metadata keys in Chroma: ${Object.keys(unfilteredResults[0].metadata).join(", ")}`);
            
            // Check if documentId exists in stored metadata
            const storedDocId = unfilteredResults[0].metadata?.documentId as string | undefined;
            if (storedDocId) {
              logger.debug(`Document ID match: inserted="${docId}", stored="${storedDocId}", match=${docId === storedDocId}`);
            } else {
              logger.warn(`Document ID NOT found in stored metadata! Inserted: "${docId}", Stored metadata keys: ${Object.keys(unfilteredResults[0].metadata).join(", ")}`);
            }
          } else {
            logger.warn(`Verification search returned 0 results - documents may not have been stored`);
          }
          
          // Now try with filter to see if it works
          try {
            const filteredResults = await store.similaritySearch(documents[0].pageContent.slice(0, 50), 1, { documentId: { $eq: docId } });
            logger.debug(`Filtered search found ${filteredResults.length} results for document ${docId}`);
          } catch (filterError) {
            const filterErrorMessage = filterError instanceof Error ? filterError.message : "Unknown error";
            logger.error(`Filtered search FAILED: ${filterErrorMessage}`);
            logger.error(`This indicates a metadata key mismatch or filter syntax issue`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error(`Verification search failed: ${errorMessage}`);
        }
      }
    }

    logger.debug(`Successfully added ${documents.length} documents`);
  }

  /**
   * Search for documents similar to a query string.
   *
   * @param query - The search query text.
   * @param k - Number of results to return (default: 4).
   * @param filter - Optional metadata filter to apply during search (e.g., { documentId: ["id1", "id2"] }).
   * @returns Array of search results with documents and similarity scores.
   */
    async similaritySearch(query: string, k: number = 4, filter?: Record<string, unknown>): Promise<SearchResult[]> {
      const store = await this.getStore();

     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     let rawResults: any;

     // If a filter is provided, use similaritySearchWithScore with filter
     if (filter && Object.keys(filter).length > 0) {
       logger.debug(`Searching with metadata filter: ${JSON.stringify(filter)}`);
       
       // Use LangChain's similaritySearchWithScore with filter parameter
       // The filter is passed directly to Chroma's where clause
       // IMPORTANT: Do NOT catch filter errors - let them propagate so failures are visible
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       rawResults = await store.similaritySearchWithScore(query, k, filter as any);
     } else {
       // No filter - perform standard search
       rawResults = await store.similaritySearchWithScore(query, k);
     }

     // Chroma's similaritySearchWithScore returns [Document, number][] where
     // the score is a distance (lower = more similar). We normalise it to a
     // similarity score (higher = more similar) using: similarity = 1 / (1 + distance)
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     const searchResults: SearchResult[] = (rawResults as any[]).map(([doc, distance]) => {
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       const ragDoc = doc as any as RagDocument;
       return {
         document: ragDoc,
         score: 1 / (1 + distance),
       };
     });

      logger.debug(`Found ${searchResults.length} results`);

     return searchResults;
   }

  /**
   * Delete all vectors belonging to a specific document.
   *
   * Uses Chroma's metadata filter to remove every chunk whose
   * `documentId` equals the supplied value. This is the targeted
   * deletion used when a document is removed from the Knowledge Center,
   * so the assistant can no longer retrieve chunks from a deleted document.
   *
   * @param documentId - The documentId whose vectors should be removed.
   */
  async deleteDocument(documentId: string): Promise<void> {
    logger.info(`Deleting vectors for document: ${documentId}`);

    const chromaStore = await this.getStore();

    // Chroma's delete accepts a `filter` matching metadata fields.
    // We remove every chunk whose documentId metadata equals the target.
    await chromaStore.delete({
      filter: { documentId: { $eq: documentId } },
    });

    logger.info(`Deleted vectors for document: ${documentId}`);
  }

  /**
   * Delete all documents from the store.
   * This resets the collection entirely.
   */
  async deleteAll(): Promise<void> {
    logger.debug(`Deleting all documents from collection: ${this.config.collectionName}`);

    try {
      const chromaStore = await this.getStore();
      const collection = await chromaStore.ensureCollection();
      
      // Delete the collection entirely using ChromaClient's official deleteCollection API
      const client = chromaStore.index;
      if (client && typeof client.deleteCollection === 'function') {
        await client.deleteCollection({ name: this.config.collectionName });
        logger.info(`Deleted Chroma collection: ${this.config.collectionName}`);
      } else {
        // Fallback: delete all documents using the LangChain wrapper's delete method
        await chromaStore.delete({ filter: { $ne: null } });
        logger.info(`Deleted all documents from collection using LangChain delete API`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Failed to delete collection: ${errorMessage}`);
      throw error;
    } finally {
      this.store = null;
    }
  }
}