/**
 * Vector store for the RAG pipeline.
 *
 * Uses LangChain's Chroma vector store integration to persist document
 * embeddings and enable similarity search. The implementation is wrapped
 * behind the `VectorStore` interface so the underlying store (Chroma,
 * Pinecone, Qdrant, etc.) can be swapped without changing the pipeline.
 *
 * ChromaDB runs in-memory by default with optional persistence to disk.
 */

import { Chroma } from "@langchain/community/vectorstores/chroma";
import { createLogger } from "../../utils/logger";
import type { RagDocument, SearchResult, VectorStoreConfig, VectorStore } from "./types";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";

const logger = createLogger("RagVectorStore");

  /**
   * Default configuration for the Chroma vector store.
   */
  const DEFAULT_VECTORSTORE_CONFIG: Required<VectorStoreConfig> = {
    collectionName: "talker_rag",
    host: "localhost",
    port: 8000,
    dimensions: 768,
  };

/**
 * Vector store implementation using ChromaDB via LangChain.
 *
 * Manages a Chroma collection for storing and querying document embeddings.
 * The store is lazily initialised — the Chroma collection is created on
 * the first `addDocuments` or `similaritySearch` call.
 *
 * @implements {VectorStore}
 */
export class RagVectorStore implements VectorStore {
  private config: Required<VectorStoreConfig>;
  private embeddings: EmbeddingsInterface;
  private store: Chroma | null = null;

  constructor(embeddings: EmbeddingsInterface, config?: Partial<VectorStoreConfig>) {
    this.config = { ...DEFAULT_VECTORSTORE_CONFIG, ...config };
    this.embeddings = embeddings;

    logger.debug(
      `Initialized vector store: collection=${this.config.collectionName}`,
    );
  }

  /**
   * Lazily initialise the underlying Chroma store.
   * Creates or retrieves the collection on first access.
   */
  private async getStore(): Promise<Chroma> {
    if (!this.store) {
      logger.debug(`Creating Chroma collection: ${this.config.collectionName}`);

      // Use client-server ChromaDB connection.
      // ChromaDB 3.x requires a running server - we connect via HTTP.
      this.store = new Chroma(this.embeddings, {
        url: `http://${this.config.host}:${this.config.port}`,
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
    logger.info(`[INSTRUMENT] addDocuments called with collection="${this.config.collectionName}" host="${this.config.host}" port="${this.config.port}" dimensions="${this.config.dimensions}"`);

    const store = await this.getStore();
    
    // Log the actual store configuration
    logger.info(`[INSTRUMENT] Chroma store instance URL: http://${this.config.host}:${this.config.port}`);
    logger.info(`[INSTRUMENT] Chroma collection name: ${this.config.collectionName}`);
    
    // Get document count before adding
    let countBefore = 0;
    try {
      const collection = await store.ensureCollection();
      countBefore = await collection.count();
      logger.info(`[INSTRUMENT] Document count BEFORE adding: ${countBefore}`);
    } catch (e) {
      logger.debug(`[INSTRUMENT] Could not get count before: ${e}`);
    }
    
    await store.addDocuments(documents);

    logger.debug(`Successfully added ${documents.length} documents`);
    
    // Get document count after adding
    try {
      const collection = await store.ensureCollection();
      const countAfter = await collection.count();
      logger.info(`[INSTRUMENT] Document count AFTER adding: ${countAfter}`);
      logger.info(`[INSTRUMENT] Documents added in this batch: ${countAfter - countBefore}`);
    } catch (e) {
      logger.debug(`[INSTRUMENT] Could not get count after: ${e}`);
    }
    
    logger.info(`[INSTRUMENT] addDocuments completed for ${documents.length} documents`);
  }

  /**
   * Search for documents similar to a query string.
   *
   * @param query - The search query text.
   * @param k - Number of results to return (default: 4).
   * @returns Array of search results with documents and similarity scores.
   */
  async similaritySearch(query: string, k: number = 4): Promise<SearchResult[]> {
    logger.info(`[TRACE 5.4] similaritySearch() called with query="${query.slice(0, 80)}...", k=${k}`);
    logger.info(`[TRACE 5.4.0] SEARCH DETAILS: collection="${this.config.collectionName}", url="http://${this.config.host}:${this.config.port}"`);
    logger.info(`[INSTRUMENT] similaritySearch called with collection="${this.config.collectionName}" host="${this.config.host}" port="${this.config.port}" dimensions="${this.config.dimensions}"`);

    const store = await this.getStore();

    // Log the actual store configuration
    logger.info(`[INSTRUMENT] Chroma store instance URL: http://${this.config.host}:${this.config.port}`);
    logger.info(`[INSTRUMENT] Chroma collection name: ${this.config.collectionName}`);

    // Get document count before search
    let countBefore = 0;
    try {
      const collection = await store.ensureCollection();
      countBefore = await collection.count();
      logger.info(`[TRACE 5.4.1] Total documents in collection BEFORE search: ${countBefore}`);
      
      // CRITICAL: If documents exist, list them all
      if (countBefore > 0) {
        try {
          const allDocs = await collection.get();
          if (allDocs && allDocs.ids && allDocs.ids.length > 0) {
            logger.warn(`[TRACE 5.4.1.5] CRITICAL: Collection has ${allDocs.ids.length} documents. Listing ALL documents in collection:`);
            allDocs.ids.forEach((id: string, idx: number) => {
              const metadata = allDocs.metadatas?.[idx] || {};
              const docContent = allDocs.documents?.[idx] || 'NO_CONTENT';
              const preview = docContent.slice(0, 100);
              logger.warn(`[TRACE 5.4.1.6] Document ${idx + 1}/${allDocs.ids.length}: ID="${id}", metadata=${JSON.stringify(metadata)}, preview="${preview}..."`);
            });
          }
        } catch (e) {
          logger.debug(`[TRACE 5.4.1.5] Could not list all documents: ${e}`);
        }
      }
    } catch (e) {
      logger.debug(`[TRACE 5.4.1] Could not get count before search: ${e}`);
    }

    // Chroma's similaritySearchWithScore returns [Document, number][] where
    // the score is a distance (lower = more similar). We normalise it to a
    // similarity score (higher = more similar) using: similarity = 1 / (1 + distance)
    const results = await store.similaritySearchWithScore(query, k);
    logger.info(`[TRACE 5.5] Chroma similaritySearchWithScore returned ${results.length} raw results`);

    const searchResults: SearchResult[] = results.map(([doc, distance]) => ({
      document: doc as RagDocument,
      score: 1 / (1 + distance),
    }));

    logger.debug(`Found ${searchResults.length} results`);
    logger.info(`[INSTRUMENT] similaritySearch returned ${searchResults.length} results`);
    logger.info(`[TRACE 5.6] After score normalization, returning ${searchResults.length} results`);
    
    // DETAILED TRACE LOGGING
    logger.info(`[TRACE 5.7] Querying Chroma collection: "${this.config.collectionName}" at http://${this.config.host}:${this.config.port}`);
    logger.info(`[TRACE 5.8] Raw Chroma results: ${results.length} documents out of ${countBefore} total`);
    
    if (results.length > 0) {
      logger.warn(`[TRACE 5.8.5] CRITICAL: Retrieved ${results.length} documents from collection with ${countBefore} total documents:`);
      results.forEach(([doc, distance], index) => {
        const docId = (doc as any).metadata?.documentId || 'NO_ID';
        const metadata = (doc as any).metadata || {};
        const chunkPreview = ((doc as any).pageContent || '').slice(0, 100);
        const scorePercent = (1 / (1 + distance) * 100).toFixed(1);
        logger.warn(`[TRACE 5.9] Result ${index + 1}/${results.length}: ID="${docId}", distance=${distance.toFixed(4)}, score=${scorePercent}%, metadata=${JSON.stringify(metadata)}, preview="${chunkPreview}..."`);
      });
    } else {
      logger.info(`[TRACE 5.8.5] No documents retrieved from collection (collection has ${countBefore} documents)`);
    }

    return searchResults;
  }

  /**
   * Delete all documents from the store.
   * This resets the collection entirely.
   */
  async deleteAll(): Promise<void> {
    logger.info(`[TRACE 17] RagVectorStore.deleteAll() called on collection="${this.config.collectionName}"`);
    logger.info(`[TRACE 17.0] RESET DETAILS: collection="${this.config.collectionName}", url="http://${this.config.host}:${this.config.port}"`);
    logger.debug(`Deleting all documents from collection: ${this.config.collectionName}`);
    logger.info(`[INSTRUMENT] deleteAll called with collection="${this.config.collectionName}"`);

    try {
      // Get the current store instance
      const chromaStore = await this.getStore();
      
      // Access the underlying Chroma collection using the official API
      const collection = await chromaStore.ensureCollection();
      
      // Get document count before deletion
      const countBefore = await collection.count();
      logger.info(`[INSTRUMENT] Documents in collection BEFORE delete: ${countBefore}`);
      logger.info(`[TRACE 17.1] Document count BEFORE reset: ${countBefore}`);
      
      // CRITICAL: Log all documents that exist before deletion
      if (countBefore > 0) {
        try {
          const allDocs = await collection.get();
          if (allDocs && allDocs.ids && allDocs.ids.length > 0) {
            logger.info(`[TRACE 17.1.5] CRITICAL: Listing all ${allDocs.ids.length} documents BEFORE deletion:`);
            allDocs.ids.forEach((id: string, idx: number) => {
              const metadata = allDocs.metadatas?.[idx] || {};
              const preview = allDocs.documents?.[idx]?.slice(0, 100) || 'NO_CONTENT';
              logger.info(`[TRACE 17.1.6] Document ${idx + 1}: ID="${id}", metadata=${JSON.stringify(metadata)}, preview="${preview}..."`);
            });
          }
        } catch (e) {
          logger.debug(`[TRACE 17.1.5] Could not list documents before deletion: ${e}`);
        }
      }
      
      // Delete the collection entirely using ChromaClient's official deleteCollection API
      // The Chroma wrapper exposes the client via the 'index' property
      const client = chromaStore.index;
      let deleteMethod = 'unknown';
      if (client && typeof client.deleteCollection === 'function') {
        await client.deleteCollection({ name: this.config.collectionName });
        deleteMethod = 'deleteCollection';
        logger.info(`[INSTRUMENT] Deleted Chroma collection: ${this.config.collectionName}`);
        logger.info(`[TRACE 17.2] Deleted Chroma collection using deleteCollection(): ${this.config.collectionName}`);
      } else {
        // Fallback: delete all documents using the LangChain wrapper's delete method
        await chromaStore.delete({ filter: { $ne: null } });
        deleteMethod = 'store.delete({ filter: { $ne: null } })';
        logger.info(`[INSTRUMENT] Deleted all documents from collection using LangChain delete API`);
        logger.info(`[TRACE 17.2] Deleted all documents using LangChain delete API`);
      }
      logger.info(`[TRACE 17.2.5] Delete method used: ${deleteMethod}`);
      
      // Verify deletion - need to get a fresh collection reference after deletion
      const countAfter = await chromaStore.ensureCollection().then(c => c.count()).catch(() => 0);
      logger.info(`[INSTRUMENT] Documents in collection AFTER delete: ${countAfter}`);
      logger.info(`[TRACE 17.3] Document count AFTER reset: ${countAfter}`);
      
      if (countAfter > 0) {
        logger.warn(`[INSTRUMENT] Collection still has ${countAfter} documents after delete!`);
        logger.warn(`[TRACE 17.4] WARNING: Collection still has ${countAfter} documents after reset!`);
        
        // CRITICAL: List the documents that still exist
        try {
          const remainingDocs = await chromaStore.ensureCollection().then(c => c.get());
          if (remainingDocs && remainingDocs.ids && remainingDocs.ids.length > 0) {
            logger.warn(`[TRACE 17.4.5] CRITICAL: Listing all ${remainingDocs.ids.length} REMAINING documents after deletion:`);
            remainingDocs.ids.forEach((id: string, idx: number) => {
              const metadata = remainingDocs.metadatas?.[idx] || {};
              const preview = remainingDocs.documents?.[idx]?.slice(0, 100) || 'NO_CONTENT';
              logger.warn(`[TRACE 17.4.6] REMAINING Document ${idx + 1}: ID="${id}", metadata=${JSON.stringify(metadata)}, preview="${preview}..."`);
            });
          }
        } catch (e) {
          logger.debug(`[TRACE 17.4.5] Could not list remaining documents: ${e}`);
        }
      } else {
        logger.info(`[TRACE 17.4] SUCCESS: Collection is now empty (count=0)`);
      }
      
      // Check if a new collection was created
      logger.info(`[TRACE 17.4.7] Checking if new collection was created...`);
      const countFinal = await chromaStore.ensureCollection().then(c => c.count()).catch(() => 0);
      logger.info(`[TRACE 17.4.8] Final verification count: ${countFinal}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[INSTRUMENT] Failed to delete collection: ${errorMessage}`);
      logger.info(`[TRACE ERROR] Failed to delete collection: ${errorMessage}`);
      throw error;
    } finally {
      // Nullify the store to force reinitialization
      this.store = null;
      logger.debug(`[INSTRUMENT] Store reference nullified`);
      logger.info(`[TRACE 17.5] Store reference nullified, will reinitialize on next access`);
    }
  }
}