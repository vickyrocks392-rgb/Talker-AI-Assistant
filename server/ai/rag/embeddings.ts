/**
 * Embedding generator for the RAG pipeline.
 *
 * Uses LangChain's OllamaEmbeddings to convert text chunks into vector
 * representations via a locally-running Ollama server. The implementation
 * is wrapped behind the `EmbeddingGenerator` interface so the underlying
 * embedding model or provider can be swapped without changing the pipeline.
 */

import { OllamaEmbeddings } from "@langchain/ollama";
import { createLogger } from "../../utils/logger";
import type { EmbeddingConfig, EmbeddingGenerator } from "./types";

const logger = createLogger("RagEmbeddings");

/**
 * Default configuration for the embedding generator.
 */
const DEFAULT_EMBEDDING_CONFIG: Required<EmbeddingConfig> = {
  model: "nomic-embed-text",
  baseUrl: "http://127.0.0.1:11434",
  dimensions: 768,
};

/**
 * Embedding generator implementation using Ollama via LangChain.
 *
 * Connects to a local Ollama server to generate embeddings for both
 * individual queries and batches of documents.
 *
 * @implements {EmbeddingGenerator}
 */
export class RagEmbeddings implements EmbeddingGenerator {
  private embeddings: OllamaEmbeddings;
  private config: Required<EmbeddingConfig>;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };

    logger.debug(`Initializing Ollama embeddings: model=${this.config.model}`);
    logger.info(`[INSTRUMENT] Embedding model initialized: model="${this.config.model}" baseUrl="${this.config.baseUrl}" dimensions="${this.config.dimensions}"`);

    this.embeddings = new OllamaEmbeddings({
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      dimensions: this.config.dimensions,
    });
  }

  /**
   * Generate an embedding vector for a single text query.
   *
   * @param text - The text to embed.
   * @returns A vector of numbers representing the text embedding.
   */
  async embedQuery(text: string): Promise<number[]> {
    logger.debug(`Embedding query: ${text.slice(0, 80)}...`);
    logger.info(`[INSTRUMENT] embedQuery called with model="${this.config.model}"`);

    const vector = await this.embeddings.embedQuery(text);

    logger.debug(`Generated embedding with ${vector.length} dimensions`);
    logger.info(`[INSTRUMENT] embedQuery generated ${vector.length} dimensions`);

    return vector;
  }

  /**
   * Generate embedding vectors for multiple texts in batch.
   *
   * @param documents - Array of text strings to embed.
   * @returns An array of embedding vectors, one per input text.
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    logger.debug(`Embedding ${documents.length} documents`);
    logger.info(`[INSTRUMENT] embedDocuments called with model="${this.config.model}" count=${documents.length}`);

    const vectors = await this.embeddings.embedDocuments(documents);

    logger.debug(
      `Generated ${vectors.length} embeddings, each with ${vectors[0]?.length ?? 0} dimensions`,
    );
    logger.info(`[INSTRUMENT] embedDocuments generated ${vectors.length} embeddings, each with ${vectors[0]?.length ?? 0} dimensions`);

    return vectors;
  }
}