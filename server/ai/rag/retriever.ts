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
  scoreThreshold: 0.3,
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
   *   2. Search the vector store for similar vectors (with optional document ID filter)
   *   3. Filter results below the score threshold
   *   4. Return the top-k results
   *
   * @param query - The search query text.
   * @param documentIds - Optional array of document IDs to scope retrieval to.
   * @returns Array of search results, ordered by relevance (highest score first).
   */
   async retrieve(query: string, documentIds?: string[]): Promise<SearchResult[]> {
     // ── DEBUG: Retriever entry point ───────────────────────────────────────
     logger.info("=== Retriever Debug ===");
     if (documentIds && documentIds.length > 0) {
       logger.info("single-document mode or multi-document mode: " + (documentIds.length === 1 ? "single-document" : "multi-document"));
     } else {
       logger.info("single-document mode or multi-document mode: none (unfiltered)");
     }
     // ── END DEBUG ───────────────────────────────────────────────────────────

     logger.debug(`Retrieving for query: "${query.slice(0, 80)}..."`);

     // Log the exact attachment array
     if (documentIds && documentIds.length > 0) {
       logger.info(`Requested docs: ${documentIds.length} attachment(s)`);
       for (const id of documentIds) {
         logger.info(`  - ${id}`);
       }
     }

     // Step 1: Embed the query
     await this.embeddings.embedQuery(query);

     let results: SearchResult[];

     // Step 2: Search the vector store
     // For multiple document IDs, use individual queries and merge (Chroma $in may not work)
     if (documentIds && documentIds.length > 0) {
       if (documentIds.length === 1) {
         // Single document: use direct filter
         const filter = {
           documentId: { $eq: documentIds[0] },
         };
         logger.debug(`Retrieval filter structure: ${JSON.stringify(filter)}`);
         
         try {
           results = await this.vectorStore.similaritySearch(query, this.config.k, filter);
         } catch (error) {
           const errorMessage = error instanceof Error ? error.message : "Unknown error";
           logger.error(`Vector store similarity search failed: ${errorMessage}`);
           logger.error(`Filter that caused failure: ${JSON.stringify(filter)}`);
           throw error;
         }
       } else {
         // Multiple documents: perform independent retrieval for each document
         // This ensures each document contributes chunks to the result set
         logger.info(`Multiple document retrieval mode enabled`);
         
         const allResults: SearchResult[] = [];
         const perDocResults = new Map<string, SearchResult[]>();
         
         for (const docId of documentIds) {
           const filter = { documentId: { $eq: docId } };
           logger.debug(`Querying for document: ${docId}`);
           
           try {
             const docResults = await this.vectorStore.similaritySearch(query, this.config.k, filter);
             perDocResults.set(docId, docResults);
             allResults.push(...docResults);
             logger.debug(`Document ${docId}: retrieved ${docResults.length} chunks`);
           } catch (error) {
             const errorMessage = error instanceof Error ? error.message : "Unknown error";
             logger.warn(`Failed to retrieve for document ${docId}: ${errorMessage}`);
           }
         }
         
         // Deduplicate by documentId + chunkIndex
         const seenKeys = new Set<string>();
         const deduplicatedResults: SearchResult[] = [];
         for (const result of allResults) {
           const docId = result.document.metadata?.documentId as string | undefined;
           const chunkIndex = result.document.metadata?.chunkIndex as number | undefined;
           const dedupeKey = `${docId ?? "unknown"}:${chunkIndex ?? "unknown"}`;
           
           if (!seenKeys.has(dedupeKey)) {
             seenKeys.add(dedupeKey);
             deduplicatedResults.push(result);
           }
         }
         
         // Sort by score descending (most relevant first)
         const sortedResults = deduplicatedResults.sort((a, b) => b.score - a.score);
         
         results = sortedResults;
         
         // Log retrieval results per document
         for (const [docId, docResults] of perDocResults) {
           const filenames = docResults
             .map(r => r.document.metadata?.filename as string | undefined)
             .filter((f): f is string => !!f);
           const uniqueFilenames = [...new Set(filenames)];
           logger.info(`  ${uniqueFilenames.join(", ")} -> ${docResults.length} chunks`);
         }
         
         logger.info(`Merged retrieval: ${results.length} chunks total`);
       }
     } else {
       // No filter - perform standard search
       results = await this.vectorStore.similaritySearch(query, this.config.k);
     }

     // Log every retrieved chunk with metadata
     logger.debug(`Retrieved ${results.length} chunks total`);
     for (let i = 0; i < results.length; i++) {
       const r = results[i];
       const chunkDocId = r.document.metadata?.documentId as string | undefined;
       const chunkFilename = r.document.metadata?.filename as string | undefined;
       logger.debug(
         `Chunk ${i + 1}:\n` +
         `  documentId=${chunkDocId ?? "undefined"}\n` +
         `  filename=${chunkFilename ?? "undefined"}\n` +
         `  score=${r.score.toFixed(4)}`
       );
     }

     // Step 3: Filter by score threshold
     const filtered = results.filter(
       (result) => result.score >= this.config.scoreThreshold,
     );

     // Step 4: Sort by score descending (most relevant first)
     const sorted = filtered.sort((a, b) => b.score - a.score);

     // For multiple documents, we want to return more chunks to cover all documents
     // Calculate the limit: for multiple docs, use k * numDocs to ensure coverage
     const limit = documentIds && documentIds.length > 1
       ? this.config.k * documentIds.length
       : this.config.k;

     // Limit to k results (or k * numDocs for multiple documents)
     const topK = sorted.slice(0, limit);

     // ── DEBUG: Retriever results returned ───────────────────────────────────
     logger.info("results returned: " + topK.length);
     // ── END DEBUG ───────────────────────────────────────────────────────────

     logger.debug(
       `Retrieved ${results.length} results, ${topK.length} passed threshold ${this.config.scoreThreshold}`,
     );

     return topK;
   }
}