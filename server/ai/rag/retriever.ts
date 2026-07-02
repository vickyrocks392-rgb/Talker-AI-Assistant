/**
 * Retriever for the RAG pipeline.
 *
 * Orchestrates the embedding + vector search pipeline to return the most
 * relevant document chunks for a given query. This is the top-level
 * abstraction that consumers of the RAG engine interact with.
 *
 * The retriever composes the EmbeddingGenerator and VectorStore behind
 * the `Retriever` interface, allowing the retrieval strategy to be
 * swapped (e.g. MMR, contextual compression, hybrid search) without
 * changing the consumer's code.
 */

import { createLogger } from "../../utils/logger";
import type {
  EmbeddingGenerator,
  RetrieverConfig,
  Retriever,
  SearchResult,
  VectorStore,
} from "./types";

const logger = createLogger("RagRetriever");

/**
 * Default configuration for the retriever.
 */
const DEFAULT_RETRIEVER_CONFIG: Required<RetrieverConfig> = {
  k: 4,
  scoreThreshold: 0.7,
};

/**
 * Retriever implementation that composes an EmbeddingGenerator and
 * VectorStore to perform similarity search.
 *
 * Usage:
 * ```ts
 * const retriever = new RagRetriever(embeddings, vectorStore, { k: 5 });
 * const results = await retriever.retrieve("What is RAG?");
 * ```
 *
 * @implements {Retriever}
 */
export class RagRetriever implements Retriever {
  private config: Required<RetrieverConfig>;
  private embeddings: EmbeddingGenerator;
  private vectorStore: VectorStore;

  constructor(
    embeddings: EmbeddingGenerator,
    vectorStore: VectorStore,
    config?: Partial<RetrieverConfig>,
  ) {
    this.config = { ...DEFAULT_RETRIEVER_CONFIG, ...config };
    this.embeddings = embeddings;
    this.vectorStore = vectorStore;

    logger.debug(
      `Initialized retriever: k=${this.config.k}, scoreThreshold=${this.config.scoreThreshold}`,
    );
  }

  /**
   * Retrieve the top-k most relevant documents for a query.
   *
   * The pipeline is:
   *   1. Embed the query text into a vector
   *   2. Search the vector store for similar vectors
   *   3. Filter results below the score threshold
   *   4. Return the top-k results
   *
   * @param query - The search query text.
   * @returns Array of search results, ordered by relevance (highest score first).
   */
  async retrieve(query: string): Promise<SearchResult[]> {
    logger.debug(`Retrieving for query: "${query.slice(0, 80)}..."`);

    // Step 1: Embed the query
    const queryVector = await this.embeddings.embedQuery(query);

    logger.debug(`Query embedded: ${queryVector.length} dimensions`);

    // Step 2: Search the vector store
    const results = await this.vectorStore.similaritySearch(query, this.config.k);

    // Step 3: Filter by score threshold
    const filtered = results.filter(
      (result) => result.score >= this.config.scoreThreshold,
    );

    // Step 4: Sort by score descending (most relevant first)
    const sorted = filtered.sort((a, b) => b.score - a.score);

    // Limit to k results
    const topK = sorted.slice(0, this.config.k);

    logger.debug(
      `Retrieved ${results.length} results, ${topK.length} passed threshold ${this.config.scoreThreshold}`,
    );

    return topK;
  }
}