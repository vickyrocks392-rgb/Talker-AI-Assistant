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
      const collection = await (store as any).getStoreInstance();
      countBefore = await collection.count();
      logger.info(`[INSTRUMENT] Document count BEFORE adding: ${countBefore}`);
    } catch (e) {
      logger.debug(`[INSTRUMENT] Could not get count before: ${e}`);
    }
    
    await store.addDocuments(documents);

    logger.debug(`Successfully added ${documents.length} documents`);
    
    // Get document count after adding
    try {
      const collection = await (store as any).getStoreInstance();
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
    logger.debug(`Searching for: "${query.slice(0, 80)}..." (k=${k})`);
    logger.info(`[TRACE 5.4] similaritySearch() called with query="${query.slice(0, 80)}...", k=${k}`);
    logger.info(`[INSTRUMENT] similaritySearch called with collection="${this.config.collectionName}" host="${this.config.host}" port="${this.config.port}" dimensions="${this.config.dimensions}"`);

    const store = await this.getStore();

    // Log the actual store configuration
    logger.info(`[INSTRUMENT] Chroma store instance URL: http://${this.config.host}:${this.config.port}`);
    logger.info(`[INSTRUMENT] Chroma collection name: ${this.config.collectionName}`);

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

    return searchResults;
  }

  /**
   * Delete all documents from the store.
   * This resets the collection entirely.
   */
  async deleteAll(): Promise<void> {
    logger.debug(`Deleting all documents from collection: ${this.config.collectionName}`);
    logger.info(`[INSTRUMENT] deleteAll called with collection="${this.config.collectionName}"`);

    // Chroma's delete method requires either ids or a filter.
    // For a full reset, we re-create the collection by nullifying the store
    // and letting getStore() create a fresh one on next access.
    this.store = null;

    // Re-create the collection by initialising a fresh store
    await this.getStore();

    logger.debug(`Collection reset complete: ${this.config.collectionName}`);
    logger.info(`[INSTRUMENT] deleteAll completed`);
  }
}