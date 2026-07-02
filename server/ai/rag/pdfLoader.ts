/**
 * PDF document loader for the RAG pipeline.
 *
 * Uses `pdf-parse` to extract text content and metadata from PDF files.
 * Implements the `DocumentLoader` interface defined in types.ts so it can
 * be swapped into the pipeline without changing orchestration code.
 *
 * @module server/ai/rag/pdfLoader
 */

import { createLogger } from "../../utils/logger";
import type { DocumentLoader, LoaderConfig, LoaderResult } from "./types";

const logger = createLogger("PdfLoader");

/**
 * Default configuration for the PDF loader.
 */
const DEFAULT_LOADER_CONFIG: Required<LoaderConfig> = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
  supportedMimeTypes: ["application/pdf"],
};

/**
 * PDF document loader implementation.
 *
 * Accepts a PDF as a Buffer (from an uploaded file or filesystem read)
 * and extracts its text content using `pdf-parse`.
 *
 * @implements {DocumentLoader}
 */
export class PdfLoader implements DocumentLoader {
  private config: Required<LoaderConfig>;

  constructor(config?: LoaderConfig) {
    this.config = { ...DEFAULT_LOADER_CONFIG, ...config };
  }

  /**
   * Load and extract text from a PDF source.
   *
   * @param source - File path (string) or raw Buffer content.
   * @param config - Optional override configuration for this load operation.
   * @returns The extracted text content and associated metadata.
   * @throws {Error} If the source is too large, the file type is unsupported,
   *                 or PDF parsing fails.
   */
  async load(source: string | Buffer, config?: LoaderConfig): Promise<LoaderResult> {
    const effectiveConfig = { ...this.config, ...config };

    if (typeof source === "string") {
      return this.loadFromPath(source, effectiveConfig);
    }

    return this.loadFromBuffer(source, effectiveConfig);
  }

  /**
   * Load a PDF from a file path.
   */
  private async loadFromPath(
    filePath: string,
    config: Required<LoaderConfig>,
  ): Promise<LoaderResult> {
    const { stat, readFile } = await import("node:fs/promises");
    const fileStats = await stat(filePath);

    if (fileStats.size > config.maxFileSizeBytes) {
      throw new Error(
        `File size (${fileStats.size} bytes) exceeds maximum allowed (${config.maxFileSizeBytes} bytes)`,
      );
    }

    const buffer = await readFile(filePath);
    const result = await this.parsePdf(buffer);

    result.metadata = {
      ...result.metadata,
      source: filePath,
      filename: filePath.split("/").pop() || filePath,
      size: fileStats.size,
      loadedAt: new Date().toISOString(),
    };

    logger.debug(`Loaded PDF from ${filePath}: ${result.metadata.pageCount} pages, ${result.content.length} chars`);

    return result;
  }

  /**
   * Load a PDF from a raw Buffer.
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

    const result = await this.parsePdf(buffer);

    result.metadata = {
      ...result.metadata,
      source: "buffer",
      size: buffer.length,
      loadedAt: new Date().toISOString(),
    };

    logger.debug(`Loaded PDF from buffer: ${result.metadata.pageCount} pages, ${result.content.length} chars`);

    return result;
  }

  /**
   * Parse a PDF buffer using pdf-parse and extract text + metadata.
   */
  private async parsePdf(buffer: Buffer): Promise<LoaderResult> {
    const { PDFParse } = await import("pdf-parse");

    // Convert Buffer to Uint8Array — PDFParse expects Uint8Array, not Buffer
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    let parser: InstanceType<typeof PDFParse>;
    try {
      parser = new PDFParse({ data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PDF parsing initialisation failed: ${message}`);
    }

    let textResult: { text: string; pages: Array<{ text: string; num: number }> };
    let infoResult: { info?: Record<string, unknown>; total: number };
    try {
      // Call sequentially — PDF.js worker cannot handle concurrent calls
      textResult = await parser.getText();
      infoResult = await parser.getInfo();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PDF parsing failed: ${message}`);
    } finally {
      parser.destroy();
    }

    const content = textResult.text || "";
    const pageCount = infoResult.total || textResult.pages?.length || 0;

    const metadata: Record<string, unknown> = {
      pageCount,
      textLength: content.length,
      pdfInfo: infoResult.info || {},
    };

    return { content, metadata };
  }
}