import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  FileText,
  Calendar,
  Hash,
  Layers,
  Database,
  Eye,
  Loader2,
  Cpu,
  Clock,
} from "lucide-react";
import type { RagDocument } from "./KnowledgeCenter";

interface DocumentPreviewDrawerProps {
  document: RagDocument | null;
  onClose: () => void;
  isOpen: boolean;
}

export const DocumentPreviewDrawer: React.FC<DocumentPreviewDrawerProps> = ({
  document,
  onClose,
  isOpen,
}) => {
  const [loading, setLoading] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch document text when drawer opens
  useEffect(() => {
    if (isOpen && document) {
      fetchDocumentText(document.documentId);
    } else {
      setTextContent(null);
      setError(null);
    }
  }, [isOpen, document?.documentId]);

  const fetchDocumentText = async (documentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rag/documents/${documentId}/text`);
      if (!response.ok) {
        throw new Error(`Failed to fetch document text: ${response.statusText}`);
      }
      const data = await response.json();
      setTextContent(data.text || "No extracted text available.");
    } catch (err: any) {
      setError(err.message || "Failed to load document preview");
      setTextContent(null);
    } finally {
      setLoading(false);
    }
  };

  if (!document) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Document Preview</h2>
                  <p className="text-sm text-gray-500">View document details and content</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Document Info */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 mb-1 truncate">
                      {document.filename}
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">
                          {new Date(document.uploadDate).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Hash className="w-4 h-4 flex-shrink-0" />
                        <span>{document.pages} pages</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Layers className="w-4 h-4 flex-shrink-0" />
                        <span>{document.chunkCount || Math.floor(document.size / 1000)} chunks</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Database className="w-4 h-4 flex-shrink-0" />
                        <span className="capitalize">{document.status}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text Preview */}
              <div className="p-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                    Extracted Text Preview
                  </h3>
                  
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
                    </div>
                  ) : error ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-[400px] overflow-y-auto">
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                        {textContent || "No extracted text available."}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="mt-6 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                    Metadata
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">File Size</span>
                      <span className="font-medium text-gray-900">
                        {(document.size / 1024).toFixed(2)} KB
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Pages</span>
                      <span className="font-medium text-gray-900">{document.pages}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Chunks</span>
                      <span className="font-medium text-gray-900">
                        {document.chunkCount || Math.floor(document.size / 1000)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Upload Date</span>
                      <span className="font-medium text-gray-900">
                        {new Date(document.uploadDate).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Status</span>
                      <span className={`font-medium capitalize ${
                        document.status === "indexed" ? "text-green-600" :
                        document.status === "indexing" ? "text-amber-600" :
                        "text-red-600"
                      }`}>
                        {document.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Embedding Model</span>
                      <span className="font-medium text-gray-900">
                        {document.embeddingModel || "nomic-embed-text"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Indexing Date</span>
                      <span className="font-medium text-gray-900">
                        {document.indexingDate
                          ? new Date(document.indexingDate).toLocaleString()
                          : new Date(document.uploadDate).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};