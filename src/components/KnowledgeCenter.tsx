import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileText, 
  Upload, 
  Trash2, 
  Check, 
  X, 
  AlertCircle, 
  RefreshCw,
  BookOpen,
  Database,
  Activity,
  File,
  FilePlus,
  Loader2,
  Copy,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Eye,
  Search,
  RefreshCcw,
} from "lucide-react";
import { useDocumentManager } from "../hooks/useDocumentManager";
import { DocumentPreviewDrawer } from "./DocumentPreviewDrawer";
import { DocumentInsightsModal } from "./DocumentInsightsModal";

// Simple logger for frontend
const logger = {
  info: (msg: string, data?: any) => console.log(`[KnowledgeCenter]`, msg, data),
  error: (msg: string, error?: any) => console.error(`[KnowledgeCenter]`, msg, error),
  warn: (msg: string, data?: any) => console.warn(`[KnowledgeCenter]`, msg, data),
  debug: (msg: string, data?: any) => console.debug(`[KnowledgeCenter]`, msg, data),
};

// Types for RAG document
export interface RagDocument {
  documentId: string;
  filename: string;
  uploadDate: string;
  status: "indexed" | "indexing" | "failed" | "not_indexed";
  pages: number;
  size: number;
  indexed: boolean;
  chunkCount?: number;
  textLength?: number;
  isActive?: boolean;
  embeddingModel?: string;
  indexingDate?: string;
}

interface KnowledgeStats {
  totalDocuments: number;
  totalChunks: number;
  vectorDbStatus: "ready" | "unavailable";
  lastIndexed: string | null;
  health: "healthy" | "degraded" | "unavailable" | "indexing";
}

interface KnowledgeCenterProps {
  onClose?: () => void;
}

export const KnowledgeCenter: React.FC<KnowledgeCenterProps> = ({ onClose }) => {
  const {
    documents,
    uploadDocument,
    deleteDocument,
    reindexDocument,
    isUploading,
    uploadProgress,
    indexingStatus,
    error,
    refreshDocuments,
    clearError,
  } = useDocumentManager();

  const [stats, setStats] = useState<KnowledgeStats>({
    totalDocuments: 0,
    totalChunks: 0,
    vectorDbStatus: "unavailable",
    lastIndexed: null,
    health: "unavailable",
  });
  const [dragOver, setDragOver] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<RagDocument | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  // Fetch documents and stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  // Refresh stats when documents change
  useEffect(() => {
    fetchStats();
  }, [documents]);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      // Fetch comprehensive stats from backend
      const [statsResponse, healthResponse] = await Promise.all([
        fetch("/api/rag/stats").catch(() => null),
        fetch("/api/health").catch(() => null),
      ]);

      let totalDocuments = 0;
      let totalChunks = 0;
      let vectorDbStatus: "ready" | "unavailable" = "unavailable";
      let health: "healthy" | "degraded" | "unavailable" | "indexing" = "unavailable";

      if (statsResponse && statsResponse.ok) {
        const statsData = await statsResponse.json();
        totalDocuments = statsData.totalDocuments ?? 0;
        totalChunks = statsData.totalChunks ?? 0;
        vectorDbStatus = statsData.vectorDbStatus === "ready" ? "ready" : "unavailable";
      }

      if (healthResponse && healthResponse.ok) {
        const healthData = await healthResponse.json();
        const ollamaOk = healthData.ollama === true;
        const chromaOk = healthData.chromadb === true;
        const ragReady = healthData.ragReady === true;

        if (ollamaOk && chromaOk && ragReady) {
          health = "healthy";
        } else if (ollamaOk || chromaOk) {
          health = "degraded";
        } else {
          health = "unavailable";
        }
      }

      setStats({
        totalDocuments,
        totalChunks,
        vectorDbStatus,
        lastIndexed: null,
        health,
      });
    } catch (err) {
      logger.error("Failed to fetch stats", err);
      setStats({
        totalDocuments: 0,
        totalChunks: 0,
        vectorDbStatus: "unavailable",
        lastIndexed: null,
        health: "unavailable",
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      clearError();
      await uploadDocument(file);
      await refreshDocuments();
      await fetchStats();
    } catch (error: any) {
      logger.error("Failed to upload document:", error);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      clearError();
      await deleteDocument(documentId);
      await refreshDocuments();
      await fetchStats();
    } catch (error) {
      logger.error("Failed to delete document", error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const activeDocument = documents.find(d => d.isActive) || documents[0];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header - Fixed */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-red-600" />
          <h2 className="font-semibold text-gray-900">Knowledge Center</h2>
        </div>
        <button
          onClick={() => onClose?.()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          title="Collapse Knowledge Center"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mx-4 mt-2"
          >
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
              <button onClick={clearError} className="text-red-700 hover:text-red-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content - Independently scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Upload Area */}
        <div className="p-4 border-b border-gray-200">
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center gap-3 ${
              dragOver 
                ? "border-red-400 bg-red-50" 
                : "border-gray-300 hover:border-red-300 hover:bg-gray-50"
            }`}
          >
            <input
              type="file"
              accept=".pdf,.txt,.md,.docx,.csv"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
            />
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <Upload className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 mb-1">
                Drop file here or click to upload
              </p>
              <p className="text-xs text-gray-500">
                PDF, TXT, MD, DOCX, CSV up to 10MB
              </p>
            </div>
          </label>

          {isUploading && (
            <div className="mt-3">
              <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{indexingStatus}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-red-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Statistics */}
        <div className="p-4 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-600">Documents</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">
                {statsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : stats.totalDocuments > 0 ? (
                  stats.totalDocuments
                ) : (
                  <span className="text-gray-400">Unavailable</span>
                )}
              </span>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Database className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-600">Chunks</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">
                {statsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : stats.totalChunks > 0 ? (
                  stats.totalChunks
                ) : (
                  <span className="text-gray-400">Unavailable</span>
                )}
              </span>
            </div>
          </div>
          
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-gray-600">Vector DB</span>
            <span className={`font-medium ${
              stats.vectorDbStatus === "ready" ? "text-green-600" : "text-gray-500"
            }`}>
              {stats.vectorDbStatus === "ready" ? "Ready" : "Unavailable"}
            </span>
          </div>
          
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-gray-600">Health</span>
            <span className={`font-medium ${
              stats.health === "healthy" ? "text-green-600" :
              stats.health === "degraded" ? "text-amber-600" :
              stats.health === "indexing" ? "text-blue-600" : "text-gray-500"
            }`}>
              {stats.health === "healthy" ? "Healthy" :
               stats.health === "degraded" ? "Warning" :
               stats.health === "indexing" ? "Indexing" : "Unavailable"}
            </span>
          </div>
        </div>

        {/* Current Document Card */}
        {activeDocument && (
          <div className="p-4 border-b border-gray-200">
            <div className="bg-gradient-to-r from-red-50 to-white border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-red-600" />
                <span className="font-semibold text-gray-900">Current Document</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {activeDocument.filename} is active and ready for queries.
                {activeDocument.chunkCount ? ` (${activeDocument.chunkCount} chunks)` : ''}
              </p>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    setSelectedDocument(activeDocument);
                    setShowInsights(true);
                  }}
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition"
                >
                  Summarize Document
                </button>
                <button 
                  onClick={() => reindexDocument(activeDocument.documentId)}
                  className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                >
                  Re-index
                </button>
                <button 
                  onClick={() => handleDeleteDocument(activeDocument.documentId)}
                  className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition"
                  title="Delete document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Document Library */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Document Library
          </h3>
          
          {documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                No documents uploaded yet
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.documentId}
                  className={`bg-white border rounded-xl p-3 hover:shadow-sm transition ${
                    doc.isActive ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <File className="w-4 h-4 text-gray-600 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {doc.filename}
                        </span>
                        {doc.isActive && (
                          <span className="text-xs text-red-600 font-medium">Active</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatTimeAgo(doc.uploadDate)}</span>
                        <span>•</span>
                        <span>{doc.pages} pages</span>
                        <span>•</span>
                        <span>{formatFileSize(doc.size)}</span>
                        {doc.chunkCount !== undefined && (
                          <>
                            <span>•</span>
                            <span>{doc.chunkCount} chunks</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        doc.status === "indexed" ? "bg-green-100 text-green-700" :
                        doc.status === "indexing" ? "bg-amber-100 text-amber-700" :
                        doc.status === "failed" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {doc.status}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedDocument(doc);
                          setShowPreview(true);
                        }}
                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                        title="Preview document"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc.documentId)}
                        className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition"
                        title="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Drawer */}
      <DocumentPreviewDrawer
        document={selectedDocument}
        onClose={() => setShowPreview(false)}
        isOpen={showPreview}
      />

      {/* Document Insights Modal */}
      <DocumentInsightsModal
        document={selectedDocument}
        onClose={() => setShowInsights(false)}
        isOpen={showInsights}
        onInsertIntoChat={(doc) => {
          setShowInsights(false);
          // Insert document reference into chat
          const event = new CustomEvent('insert-document-summary', { 
            detail: { document: doc }
          });
          window.dispatchEvent(event);
        }}
      />
    </div>
  );
};
