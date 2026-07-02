/**
 * Core TypeScript interfaces for the RAG engine pipeline.
 *
 * These types define the contracts between each stage of the RAG pipeline:
 *   Document → Splitter → Embeddings → Vector Store → Retriever
 *
 * Every interface is designed to be implementation-agnostic so that
 * external dependencies (LangChain, ChromaDB, Ollama) can be swapped
 * without changing the pipeline orchestration.
 */

import type { Document } from "@langchain/core/documents";

// ── Document types ───────────────────────────────────────────────────

/**
 * A raw document loaded from a source (e.g. PDF, text file, web page).
 * Extends LangChain's Document interface for compatibility with LangChain
 * splitters, embeddings, and vector stores.
 */
export interface RagDocument extends Document {
  /** The text content of the document chunk. */
  pageContent: string;
  /** Metadata associated with the document (source, page number, etc.). */
  metadata: Record<string, unknown>;
}

/**
 * Result of loading a single source file.
 * Contains the raw text and any metadata extracted during loading.
 */
export interface LoaderResult {
  /** The full raw text extracted from the source. */
  content: string;
  /** Metadata about the source (filename, page count, etc.). */
  metadata: Record<string, unknown>;
}

// ── Loader types ─────────────────────────────────────────────────────

/**
 * Configuration for a document loader.
 * Each loader implementation may support different source types.
 */
export interface LoaderConfig {
  /** Maximum file size in bytes (default: 10MB). */
  maxFileSizeBytes?: number;
  /** Supported MIME types for validation. */
  supportedMimeTypes?: string[];
}

/**
 * Interface for document loaders.
 * Implementations handle different source types (PDF, text, etc.).
 */
export interface DocumentLoader {
  /** Load and extract text from a source file. */
  load(source: string | Buffer, config?: LoaderConfig): Promise<LoaderResult>;
}

// ── Splitter types ───────────────────────────────────────────────────

/**
 * Configuration for the text splitter.
 * Controls how documents are chunked before embedding.
 */
export interface SplitterConfig {
  /** Target size of each chunk in characters. */
  chunkSize: number;
  /** Number of overlapping characters between consecutive chunks. */
  chunkOverlap: number;
  /** Separators to use for splitting, in order of preference. */
  separators?: string[];
}

/**
 * Interface for text splitters.
 * Implementations chunk documents into smaller pieces for embedding.
 */
export interface TextSplitter {
  /** Split a document into an array of smaller document chunks. */
  splitDocuments(documents: RagDocument[]): Promise<RagDocument[]>;
  /** Split raw text into an array of document chunks. */
  splitText(text: string, metadata?: Record<string, unknown>): Promise<RagDocument[]>;
}

// ── Embedding types ──────────────────────────────────────────────────

/**
 * Configuration for the embedding generator.
 */
export interface EmbeddingConfig {
  /** The Ollama model to use for generating embeddings. */
  model: string;
  /** Base URL of the Ollama server. */
  baseUrl: string;
  /** Number of dimensions in the embedding vectors. */
  dimensions?: number;
}

/**
 * Interface for embedding generators.
 * Converts text chunks into numerical vector representations.
 */
export interface EmbeddingGenerator {
  /** Generate an embedding vector for a single text string. */
  embedQuery(text: string): Promise<number[]>;
  /** Generate embedding vectors for multiple text strings in batch. */
  embedDocuments(documents: string[]): Promise<number[][]>;
}

// ── Vector Store types ───────────────────────────────────────────────

/**
 * Configuration for the vector store.
 */
export interface VectorStoreConfig {
  /** Name of the collection to use/create in the vector store. */
  collectionName: string;
  /** Path to the ChromaDB persistence directory. */
  persistDirectory?: string;
  /** Number of dimensions for stored vectors. */
  dimensions?: number;
}

/**
 * Result of a vector store search.
 */
export interface SearchResult {
  /** The matched document chunk. */
  document: RagDocument;
  /** Similarity score (0-1, higher is more similar). */
  score: number;
}

/**
 * Interface for vector stores.
 * Stores document embeddings and enables similarity search.
 */
export interface VectorStore {
  /** Add documents with their embeddings to the store. */
  addDocuments(documents: RagDocument[]): Promise<void>;
  /** Search for documents similar to a query embedding. */
  similaritySearch(query: string, k?: number): Promise<SearchResult[]>;
  /** Delete all documents from the store. */
  deleteAll(): Promise<void>;
}

// ── Retriever types ──────────────────────────────────────────────────

/**
 * Configuration for the retriever.
 */
export interface RetrieverConfig {
  /** Number of documents to retrieve per query. */
  k: number;
  /** Minimum similarity score threshold (0-1). */
  scoreThreshold?: number;
}

/**
 * Interface for retrievers.
 * Orchestrates embedding + search to return relevant documents for a query.
 */
export interface Retriever {
  /** Retrieve the top-k most relevant documents for a query. */
  retrieve(query: string): Promise<SearchResult[]>;
}

// ── Pipeline types ───────────────────────────────────────────────────

/**
 * Complete configuration for the RAG pipeline.
 * Aggregates all component configurations into a single object.
 */
export interface RagPipelineConfig {
  loader?: LoaderConfig;
  splitter: SplitterConfig;
  embeddings: EmbeddingConfig;
  vectorStore: VectorStoreConfig;
  retriever: RetrieverConfig;
}

/**
 * Default configuration values for the RAG pipeline.
 */
export const DEFAULT_RAG_CONFIG: RagPipelineConfig = {
  splitter: {
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ["\n\n", "\n", ".", " ", ""],
  },
  embeddings: {
    model: "llama3.2:3b",
    baseUrl: "http://127.0.0.1:11434",
  },
  vectorStore: {
    collectionName: "talker_rag",
    persistDirectory: "./storage/rag",
  },
  retriever: {
    k: 4,
    scoreThreshold: 0.7,
  },
};