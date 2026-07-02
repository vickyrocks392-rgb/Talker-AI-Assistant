/**
 * Text splitter for the RAG pipeline.
 *
 * Chunks documents into smaller pieces suitable for embedding and retrieval.
 * Uses LangChain's RecursiveCharacterTextSplitter under the hood, wrapped
 * behind the `TextSplitter` interface so the implementation can be swapped
 * (e.g. for semantic splitting, token-aware splitting) without changing
 * the rest of the pipeline.
 *
 * The recursive splitter attempts to split on paragraph breaks first,
 * then newlines, then sentences, then words, then characters. This
 * produces coherent chunks that respect document structure.
 */

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { createLogger } from "../../utils/logger";
import type { RagDocument, SplitterConfig, TextSplitter } from "./types";

const logger = createLogger("RagSplitter");

/**
 * Default configuration for the text splitter.
 */
const DEFAULT_SPLITTER_CONFIG: Required<SplitterConfig> = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ["\n\n", "\n", ".", " ", ""],
};

/**
 * Text splitter implementation using LangChain's RecursiveCharacterTextSplitter.
 *
 * Splits documents recursively, preferring natural break points (paragraphs,
 * sentences) over arbitrary cuts.
 *
 * @implements {TextSplitter}
 */
export class RagSplitter implements TextSplitter {
  private config: Required<SplitterConfig>;
  private splitter: RecursiveCharacterTextSplitter;

  constructor(config?: Partial<SplitterConfig>) {
    this.config = { ...DEFAULT_SPLITTER_CONFIG, ...config };

    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      separators: this.config.separators,
    });

    logger.debug(
      `Initialized splitter: chunkSize=${this.config.chunkSize}, overlap=${this.config.chunkOverlap}`,
    );
  }

  /**
   * Split an array of documents into smaller chunks.
   *
   * Each document is split independently. Metadata from the original
   * document is inherited by each chunk.
   *
   * @param documents - The documents to split.
   * @returns An array of smaller document chunks.
   */
  async splitDocuments(documents: RagDocument[]): Promise<RagDocument[]> {
    logger.debug(`Splitting ${documents.length} documents`);

    const result = await this.splitter.splitDocuments(documents);

    logger.debug(
      `Split ${documents.length} documents into ${result.length} chunks`,
    );

    return result as RagDocument[];
  }

  /**
   * Split raw text into document chunks.
   *
   * Convenience method for splitting text without first wrapping it in
   * a Document object.
   *
   * @param text - The raw text to split.
   * @param metadata - Optional metadata to attach to each chunk.
   * @returns An array of document chunks.
   */
  async splitText(
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<RagDocument[]> {
    logger.debug(`Splitting text of length ${text.length}`);

    // Create a single document from the raw text
    const doc: RagDocument = {
      pageContent: text,
      metadata: metadata ?? {},
    };

    const result = await this.splitter.splitDocuments([doc]);

    logger.debug(`Split text into ${result.length} chunks`);

    return result as RagDocument[];
  }
}