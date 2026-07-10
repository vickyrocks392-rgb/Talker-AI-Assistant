import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Copy,
  MessageSquare,
  Download,
  FileText,
  Calendar,
  Hash,
  Layers,
  Sparkles,
  Key,
  Code,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { RagDocument } from "./KnowledgeCenter";

interface DocumentInsightsModalProps {
  document: RagDocument | null;
  onClose: () => void;
  isOpen: boolean;
  onInsertIntoChat: (document: RagDocument) => void;
}

interface DocumentSummary {
  summary: string;
  keyPoints: string[];
  entities: string[];
  technologies: string[];
  skills: string[];
  pageCount: number;
  chunkCount: number;
}

export const DocumentInsightsModal: React.FC<DocumentInsightsModalProps> = ({
  document,
  onClose,
  isOpen,
  onInsertIntoChat,
}) => {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<DocumentSummary | null>(null);

  // Fetch summary when modal opens
  useEffect(() => {
    if (isOpen && document) {
      fetchSummary(document.documentId);
    } else {
      setInsights(null);
      setError(null);
    }
  }, [isOpen, document?.documentId]);

  const fetchSummary = async (documentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/rag/summarize/${documentId}`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Summarization failed: ${response.statusText}`);
      }

      const data = await response.json();
      setInsights({
        summary: data.summary || "No summary available.",
        keyPoints: data.keyPoints || [],
        entities: data.entities || [],
        technologies: data.technologies || [],
        skills: data.skills || [],
        pageCount: data.pageCount || document?.pages || 0,
        chunkCount: data.chunkCount || document?.chunkCount || 0,
      });
    } catch (err: any) {
      setError(err.message || "Failed to generate summary");
      // Fallback to basic info
      setInsights({
        summary: `Document "${document?.filename}" is indexed and ready for queries.`,
        keyPoints: ["Document successfully processed and indexed", "Content is ready for semantic search queries"],
        entities: [],
        technologies: [],
        skills: [],
        pageCount: document?.pages || 0,
        chunkCount: document?.chunkCount || 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopySummary = () => {
    if (!insights) return;
    const text = `Summary: ${insights.summary}\n\nKey Points:\n${insights.keyPoints.map(p => `- ${p}`).join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!document || !insights) return;
    
    const markdown = `# ${document.filename}

## Document Information
- **Filename**: ${document.filename}
- **Upload Date**: ${new Date(document.uploadDate).toLocaleString()}
- **Pages**: ${insights.pageCount}
- **Chunks**: ${insights.chunkCount}
- **Status**: ${document.status}

## Summary
${insights.summary}

## Key Points
${insights.keyPoints.map(point => `- ${point}`).join('\n')}

## Entities
${insights.entities.map(entity => `- ${entity}`).join('\n')}

## Technologies
${insights.technologies.map(tech => `- ${tech}`).join('\n')}

## Skills
${insights.skills.map(skill => `- ${skill}`).join('\n')}
`;

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.filename.replace(/\.[^/.]+$/, "")}_insights.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!document) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Document Insights</h2>
                  <p className="text-sm text-gray-500">AI-powered analysis and summary</p>
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
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Loading State */}
              {loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-4" />
                  <p className="text-sm text-gray-600">Generating AI summary...</p>
                </div>
              )}

              {/* Error State */}
              {error && !loading && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Summary generation failed</p>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Document Info - always show */}
              {!loading && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-gray-600 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{document.filename}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(document.uploadDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Hash className="w-4 h-4" />
                          <span>{insights?.pageCount || document.pages} pages</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Layers className="w-4 h-4" />
                          <span>{insights?.chunkCount || document.chunkCount || Math.floor(document.size / 1000)} chunks</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <div className={`w-2 h-2 rounded-full ${
                            document.status === "indexed" ? "bg-green-500" :
                            document.status === "indexing" ? "bg-amber-500 animate-pulse" :
                            "bg-red-500"
                          }`} />
                          <span className="capitalize">{document.status}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              {insights && !loading && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                      Summary
                    </h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-sm text-gray-700 leading-relaxed">{insights.summary}</p>
                    </div>
                  </div>

                  {/* Key Points */}
                  {insights.keyPoints.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                        Key Points
                      </h3>
                      <div className="space-y-2">
                        {insights.keyPoints.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
                            <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-xs font-semibold text-red-600">{idx + 1}</span>
                            </div>
                            <p className="text-sm text-gray-700">{point}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Entities */}
                  {insights.entities.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                        Entities
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {insights.entities.map((entity, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium"
                          >
                            {entity}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Technologies */}
                  {insights.technologies.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                        Technologies
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {insights.technologies.map((tech, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
                          >
                            <Code className="w-3.5 h-3.5" />
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {insights.skills.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                        Skills
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {insights.skills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium flex items-center gap-1.5"
                          >
                            <Key className="w-3.5 h-3.5" />
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleCopySummary}
                disabled={!insights || loading}
                className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 px-4 rounded-xl text-sm font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Summary</span>
                  </>
                )}
              </button>
              <button
                onClick={() => onInsertIntoChat(document)}
                disabled={!insights || loading}
                className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 px-4 rounded-xl text-sm font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Insert Into Chat</span>
              </button>
              <button
                onClick={handleDownloadMarkdown}
                disabled={!insights || loading}
                className="flex-1 bg-red-600 text-white py-2.5 px-4 rounded-xl text-sm font-medium hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Download Markdown</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};