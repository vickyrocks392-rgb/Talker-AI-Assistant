/**
 * useDocumentManager — Single source of truth for all documents.
 * 
 * All document information comes from the backend.
 * No localStorage, no fake state, no mock data.
 */

import { useState, useEffect, useCallback } from "react";
import type { RagDocument } from "../components/KnowledgeCenter";

const API_BASE = "/api/rag";

export interface DocumentManagerState {
  documents: RagDocument[];
  activeDocumentId: string | null;
  isUploading: boolean;
  uploadProgress: number;
  indexingStatus: string | null;
  error: string | null;
}

export interface DocumentManagerActions {
  uploadDocument: (file: File) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  reindexDocument: (documentId: string) => Promise<void>;
  setActiveDocument: (documentId: string | null) => void;
  refreshDocuments: () => Promise<void>;
  clearDocuments: () => void;
  clearError: () => void;
}

export const useDocumentManager = (): DocumentManagerState & DocumentManagerActions => {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const refreshDocuments = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/documents`);
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }
      const data = await response.json();
      const docs: RagDocument[] = (data.documents || []).map((doc: any) => ({
        documentId: doc.documentId,
        filename: doc.filename,
        uploadDate: doc.uploadDate,
        status: doc.status || "indexed",
        pages: doc.pages || 0,
        size: doc.size || 0,
        chunkCount: doc.chunkCount || 0,
        indexed: doc.indexed || doc.status === "indexed",
        isActive: doc.isActive || false,
        embeddingModel: doc.embeddingModel || "nomic-embed-text",
        indexingDate: doc.indexingDate || doc.uploadDate,
      }));
      setDocuments(docs);

      // Sync active document
      const active = docs.find((d) => d.isActive);
      if (active) {
        setActiveDocumentId(active.documentId);
      } else if (docs.length > 0 && !activeDocumentId) {
        // If no active but we have docs, don't auto-set - backend owns this
      }
    } catch (err: any) {
      setError(err.message || "Failed to refresh documents");
      // Don't clear documents on error - keep last known state
    }
  }, []);

  // Fetch active document on mount
  useEffect(() => {
    const fetchActive = async () => {
      try {
        const response = await fetch(`${API_BASE}/documents/active`);
        if (response.ok) {
          const data = await response.json();
          if (data.document) {
            setActiveDocumentId(data.document.documentId);
          }
        }
      } catch {
        // Backend might not be available
      }
    };
    fetchActive();
  }, []);

  // Fetch documents on mount
  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const uploadDocument = useCallback(async (file: File) => {
    const supportedTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/csv",
    ];

    if (!supportedTypes.includes(file.type) && !file.name.match(/\.(pdf|txt|md|docx|csv)$/i)) {
      throw new Error("Unsupported file type. Please upload PDF, TXT, MD, DOCX, or CSV files.");
    }

    setIsUploading(true);
    setUploadProgress(0);
    setIndexingStatus("Uploading...");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Simulate progress for UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      setUploadProgress(100);
      setIndexingStatus("Indexed successfully");

      // Refresh documents from backend to get the updated list
      await refreshDocuments();

      // Set as active document
      if (result.documentId) {
        setActiveDocumentId(result.documentId);
      }

      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setIndexingStatus(null);
      }, 1500);

    } catch (error: any) {
      setIndexingStatus(error.message || "Upload failed");
      setError(error.message || "Upload failed");
      setIsUploading(false);
      setUploadProgress(0);
      throw error;
    }
  }, [refreshDocuments]);

  const deleteDocument = useCallback(async (documentId: string) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE}/documents/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Delete failed: ${response.statusText}`);
      }

      // Refresh documents from backend
      await refreshDocuments();

      // Clear active document if it was deleted
      setActiveDocumentId(prev => prev === documentId ? null : prev);
    } catch (error: any) {
      setError(error.message || "Failed to delete document");
      throw error;
    }
  }, [refreshDocuments]);

  const reindexDocument = useCallback(async (documentId: string) => {
    try {
      setError(null);
      setIndexingStatus("Reindexing...");

      const response = await fetch(`${API_BASE}/documents/${documentId}/reindex`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Reindex failed: ${response.statusText}`);
      }

      setIndexingStatus("Reindexed successfully");

      // Refresh documents from backend
      await refreshDocuments();

      setTimeout(() => {
        setIndexingStatus(null);
      }, 2000);
    } catch (error: any) {
      setError(error.message || "Failed to reindex document");
      setIndexingStatus(null);
      throw error;
    }
  }, [refreshDocuments]);

  const setActiveDocument = useCallback(async (documentId: string | null) => {
    if (!documentId) {
      setActiveDocumentId(null);
      return;
    }

    try {
      setError(null);
      const response = await fetch(`${API_BASE}/documents/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Failed to set active document: ${response.statusText}`);
      }

      setActiveDocumentId(documentId);
      await refreshDocuments();
    } catch (error: any) {
      setError(error.message || "Failed to set active document");
    }
  }, [refreshDocuments]);

  const clearDocuments = useCallback(() => {
    setDocuments([]);
    setActiveDocumentId(null);
  }, []);

  return {
    documents,
    activeDocumentId,
    isUploading,
    uploadProgress,
    indexingStatus,
    error,
    uploadDocument,
    deleteDocument,
    reindexDocument,
    setActiveDocument,
    refreshDocuments,
    clearDocuments,
    clearError,
  };
};