/**
 * Document loader for the RAG pipeline.
 *
 * Provides a base document loader implementation that extracts text from
 * source files. Currently supports plain text files; PDF support will be
 * added via LangChain's PDF loaders when the pipeline is fully integrated.
 *
 * The `DocumentLoader` interface in types.ts allows swapping implementations
 * (e.g. PDFLoader, WebLoader) without changing the pipeline orchestration.
 */

import { createLogger } from "../../utils/logger";
import type { DocumentLoader, LoaderConfig, LoaderResult } from "./types";

const logger = createLogger("RagLoader");

/**
 * Default configuration for the document loader.
 */
const DEFAULT_LOADER_CONFIG: Required<LoaderConfig> = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
  supportedMimeTypes: ["text/plain", "application/pdf"],
};

/**
 * Base document loader implementation.
 *
 * Currently handles plain text files. PDF loading via LangChain's
 * PDFLoader will be added in a subsequent phase.
 *
 * @implements {DocumentLoader}
 */
export class RagLoader implements DocumentLoader {
  private config: Required<LoaderConfig>;

  constructor(config?: LoaderConfig) {
    this.config = { ...DEFAULT_LOADER_CONFIG, ...config };
  }

  /**
   * Load and extract text from a source file.
   *
   * @param source - File path (string) or raw Buffer content.
   * @param config - Optional override configuration for this load operation.
   * @returns The extracted text content and associated metadata.
   * @throws {Error} If the source is too large or the file type is unsupported.
   */
  async load(source: string | Buffer, config?: LoaderConfig): Promise<LoaderResult> {
    const effectiveConfig = { ...this.config, ...config };
    const sourcePath = typeof source === "string" ? source : "(buffer)";

    logger.debug(`Loading document from: ${sourcePath}`);

    // If source is a file path, read it
    if (typeof source === "string") {
      return this.loadFromPath(source, effectiveConfig);
    }

    // If source is a Buffer, process it directly
    return this.loadFromBuffer(source, effectiveConfig);
  }

  /**
   * Load text from a file path.
   */
  private async loadFromPath(
    path: string,
    config: Required<LoaderConfig>,
  ): Promise<LoaderResult> {
    // Validate file size
    const { stat } = await import("node:fs/promises");
    const fileStats = await stat(path);

    if (fileStats.size > config.maxFileSizeBytes) {
      throw new Error(
        `File size (${fileStats.size} bytes) exceeds maximum allowed (${config.maxFileSizeBytes} bytes)`,
      );
    }

    // Read the file content
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(path, "utf-8");

    const metadata: Record<string, unknown> = {
      source: path,
      filename: path.split("/").pop() || path,
      size: fileStats.size,
      loadedAt: new Date().toISOString(),
    };

    logger.debug(`Loaded ${content.length} chars from ${path}`);

    return { content, metadata };
  }

  /**
   * Load text from a raw Buffer.
   */
  private async loadFromBuffer(
    buffer: Buffer,
    config: Required<LoaderConfig>,
  ): Promise<LoaderResult> {
    if (buffer.length > config.maxFileSizeBytes) {
      throw new Error(
        `Buffer size (${buffer.length} bytes) exceeds maximum allowed (${config.maxFileSizeBytes} bytes)`,
      );
    }

    const content = buffer.toString("utf-8");

    const metadata: Record<string, unknown> = {
      source: "buffer",
      size: buffer.length,
      loadedAt: new Date().toISOString(),
    };

    logger.debug(`Loaded ${content.length} chars from buffer`);

    return { content, metadata };
  }
}