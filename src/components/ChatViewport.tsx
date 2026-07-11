import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, ArrowRight, BrainCircuit, Calendar, Sparkles, MessageSquare, Code, Search, BookOpen, Paperclip, X, FileText, Loader2, Upload, AlertCircle } from "lucide-react";
import type { Message } from "../types";
import type { ChatAttachment, AIMonitorDTO } from "../lib/api";
import { MessageItem } from "./MessageItem";
import { formatDateSeparator } from "../lib/date-utils";
import { useDocumentManager } from "../hooks/useDocumentManager";
import { AttachmentChip, type Attachment, type AttachmentStatus } from "./AttachmentChip";
import { DocumentPreviewDrawer } from "./DocumentPreviewDrawer";
import { AIMonitorPanel } from "./AIMonitorPanel";

const getMessageDate = (createdAt: any): Date | null => {
  if (!createdAt) return null;
  try {
    if (createdAt instanceof Date) {
      return createdAt;
    } else if (typeof createdAt === "string" || typeof createdAt === "number") {
      return new Date(createdAt);
    }
  } catch (e) {}
  return null;
};

const isSameDay = (d1: Date | null, d2: Date | null): boolean => {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

interface ChatViewportProps {
  messages: Message[];
  loading: boolean;
  speechError: string | null;
  onClearSpeechError: () => void;
  handsFreeMode: boolean;
  onToggleHandsFree: () => void;
  inputText: string;
  onInputTextChange: (text: string) => void;
  isListening: boolean;
  onStartVoiceCapture: () => void;
  onStopVoiceCapture: () => void;
  onSendMessage: (text: string, attachments?: ChatAttachment[]) => void;
  speakingMessageId: string | null;
  copiedId: string | null;
  onSpeak: (text: string, id: string) => void;
  onCopy: (text: string, id: string) => void;
  devScrollRef: React.RefObject<HTMLDivElement | null>;
  aiMonitorData?: AIMonitorDTO | null;
}

const CAPABILITIES = [
  { icon: BrainCircuit, label: "Memory", description: "Remembers context across conversations" },
  { icon: BookOpen, label: "Knowledge", description: "Learns from your documents" },
  { icon: Code, label: "Code", description: "Writes & explains code" },
  { icon: MessageSquare, label: "Voice", description: "Natural conversation" },
  { icon: Sparkles, label: "Reasoning", description: "Solves complex problems" },
];

const SUGGESTED_PROMPTS = [
  "Explain this PDF",
  "Summarize my resume",
  "Help write Python",
  "Debug TypeScript",
  "Explain machine learning",
  "Calculate compound interest",
  "Write a React component",
  "Analyze this data",
];

export const ChatViewport: React.FC<ChatViewportProps> = ({
  messages,
  loading,
  speechError,
  onClearSpeechError,
  handsFreeMode,
  onToggleHandsFree,
  inputText,
  onInputTextChange,
  isListening,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onSendMessage,
  speakingMessageId,
  copiedId,
  onSpeak,
  onCopy,
  devScrollRef,
  aiMonitorData
}) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);
  
  // Store attachments per message ID to preserve them across backend refreshes
  const messageAttachmentsRef = useRef<Map<string, ChatAttachment[]>>(new Map());

  // ── Build attachment payload from current indexed attachments ──────
  // Converts local Attachment objects to ChatAttachment for API requests
  const buildAttachmentPayload = useCallback((): ChatAttachment[] => {
    return attachments
      .filter(a => a.status === "indexed" && a.documentId)
      .map(a => ({
        documentId: a.documentId!,
        filename: a.filename,
      }));
  }, [attachments]);

  const {
    documents,
    uploadDocument,
    deleteDocument,
    activeDocumentId,
    isUploading,
    uploadProgress,
    indexingStatus,
    error,
    setActiveDocument,
  } = useDocumentManager();

  // ── Clear attachments when a new conversation starts ──────────────
  useEffect(() => {
    if (prevMessagesLengthRef.current > 0 && messages.length === 0) {
      setAttachments([]);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // ── Sync upload progress from useDocumentManager ──────────────────
  useEffect(() => {
    if (isUploading) {
      // We don't have the filename yet during upload start,
      // so we wait for the documents list to update
    }
  }, [isUploading]);

  // ── When documents change, sync attachments with backend state ────
  useEffect(() => {
    if (documents.length === 0) return;

    setAttachments(prev => {
      const updated = [...prev];

      for (const doc of documents) {
        const existing = updated.find(a => a.documentId === doc.documentId);
        if (existing) {
          if (doc.status === "indexed" && existing.status !== "indexed") {
            const idx = updated.indexOf(existing);
            updated[idx] = {
              ...existing,
              status: "indexed",
              progress: 100,
            };
          } else if (doc.status === "failed" && existing.status !== "error") {
            const idx = updated.indexOf(existing);
            updated[idx] = {
              ...existing,
              status: "error",
              errorMessage: "Indexing failed",
            };
          }
        } else {
          const pending = updated.find(
            a => a.documentId === null && a.filename === doc.filename
          );
          if (pending) {
            const idx = updated.indexOf(pending);
            updated[idx] = {
              ...pending,
              documentId: doc.documentId,
              status: doc.status === "indexed" ? "indexed" : "indexing",
              progress: doc.status === "indexed" ? 100 : 90,
            };
          }
        }
      }

      return updated;
    });
  }, [documents]);

  // ── Handle file selection ─────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!(file instanceof File)) return;

    const pendingAttachment: Attachment = {
      documentId: null,
      filename: file.name,
      status: "uploading",
      progress: 0,
    };
    setAttachments(prev => [...prev, pendingAttachment]);

    try {
      await uploadDocument(file);
    } catch (error: any) {
      setAttachments(prev =>
        prev.map(a =>
          a.filename === file.name && a.documentId === null
            ? { ...a, status: "error" as AttachmentStatus, errorMessage: error.message || "Upload failed" }
            : a
        )
      );
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [uploadDocument]);

  const handlePaperclipClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemoveAttachment = useCallback((filename: string) => {
    setAttachments(prev => prev.filter(a => a.filename !== filename));
  }, []);

  const handleOpenPreview = useCallback((documentId: string) => {
    setPreviewDocumentId(documentId);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewDocumentId(null);
  }, []);

  const previewDocument = previewDocumentId
    ? documents.find(d => d.documentId === previewDocumentId) || null
    : null;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
    if (dragCounter === 1) {
      setIsDragging(false);
    }
  }, [dragCounter]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const fileObj = file as File;

      const pendingAttachment: Attachment = {
        documentId: null,
        filename: fileObj.name,
        status: "uploading",
        progress: 0,
      };
      setAttachments(prev => [...prev, pendingAttachment]);

      try {
        await uploadDocument(fileObj);
      } catch (error: any) {
        setAttachments(prev =>
          prev.map(a =>
            a.filename === fileObj.name && a.documentId === null
              ? { ...a, status: "error" as AttachmentStatus, errorMessage: error.message || "Upload failed" }
              : a
          )
        );
      }
    }
  }, [uploadDocument]);

  // ── Handle send ──────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!inputText.trim() || loading) return;
    const payload = buildAttachmentPayload();
    
    // Store attachments for the optimistic message before clearing
    if (payload.length > 0 && messages.length >= 0) {
      const nextMsgId = "temp_" + Math.random().toString(36).substring(2, 11);
      messageAttachmentsRef.current.set(nextMsgId, payload);
    }
    
    onSendMessage(inputText, payload.length > 0 ? payload : undefined);
    // Clear attachments after sending
    setAttachments([]);
  }, [inputText, loading, onSendMessage, buildAttachmentPayload, messages.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div 
      className="flex flex-col h-full overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-red-50/90 backdrop-blur-sm z-30 flex items-center justify-center border-2 border-dashed border-red-400 m-4 rounded-2xl"
          >
            <div className="text-center">
              <Upload className="w-16 h-16 text-red-600 mx-auto mb-4" />
              <p className="text-lg font-semibold text-gray-900 mb-2">Drop document to upload</p>
              <p className="text-sm text-gray-600">PDF, TXT, MD, DOCX, CSV</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message history - Independently scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 md:px-6 py-6">
        <div className="max-w-3xl mx-auto w-full space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-12 animate-fade-in">
              <div className="w-20 h-20 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg mb-8">
                <BrainCircuit className="text-white w-10 h-10" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">Talker AI</h1>
              <p className="text-base text-gray-600 max-w-lg mb-10">
                Your intelligent AI workspace with memory, knowledge retrieval, and voice capabilities.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10 w-full max-w-2xl">
                {CAPABILITIES.map((capability) => (
                  <div key={capability.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:border-red-200 hover:shadow-md transition-all duration-200">
                    <capability.icon className="w-6 h-6 text-red-600 mx-auto mb-2" />
                    <div className="text-sm font-semibold text-gray-900 mb-0.5">{capability.label}</div>
                    <div className="text-xs text-gray-500">{capability.description}</div>
                  </div>
                ))}
              </div>

              <div className="w-full max-w-2xl">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Suggested Actions</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button key={idx}
                      onClick={() => { onInputTextChange(prompt); onSendMessage(prompt); }}
                      className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-red-300 hover:bg-red-50/50 transition-all duration-200"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.length > 0 && (() => {
            const elements: React.ReactNode[] = [];
            let lastDate: Date | null = null;
            messages.forEach((msg, index) => {
              const currentDate = getMessageDate(msg.createdAt);
              const showSeparator = currentDate && (!lastDate || !isSameDay(lastDate, currentDate));
              if (showSeparator) {
                const separatorText = formatDateSeparator(msg.createdAt);
                if (separatorText) {
                  elements.push(
                    <div key={`sep-${msg.id || index}`} className="flex items-center justify-center py-4">
                      <div className="px-4 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 font-medium shadow-sm">{separatorText}</div>
                    </div>
                  );
                }
              }
              // Use attachments from the message object if available, otherwise fall back to current attachments
              const messageAttachments = msg.role === "user" && msg.attachments && msg.attachments.length > 0
                ? msg.attachments
                : [];
              
              elements.push(
                <MessageItem key={msg.id || index} msg={msg} index={index}
                  speakingMessageId={speakingMessageId} copiedId={copiedId}
                  onSpeak={onSpeak} onCopy={onCopy}
                  attachments={messageAttachments.length > 0 ? messageAttachments : undefined}
                  onPreviewAttachment={handleOpenPreview} />
              );
              if (currentDate) lastDate = currentDate;
            });
            return elements;
          })()}

          {loading && (
            <div className="flex items-center gap-3 py-4">
              <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                <BrainCircuit className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDuration: '1s', animationDelay: '0s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDuration: '1s', animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDuration: '1s', animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          )}

          {speechError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-center justify-between">
              <span className="text-sm">{speechError}</span>
              <button onClick={onClearSpeechError} className="text-red-700 hover:text-red-800 font-bold text-lg leading-none">×</button>
            </div>
          )}

          <div ref={devScrollRef} />
        </div>
      </div>

      {/* AI Monitor Panel — attached above input */}
      <AIMonitorPanel data={aiMonitorData ?? null} />

      {/* ── DEBUG: Log aiMonitorData received by ChatViewport ─────────── */}
      {(() => { console.log("[AI Monitor DEBUG] ChatViewport aiMonitorData:", aiMonitorData); return null; })()}

      {/* Message input - Fixed at bottom */}
      <div className="border-t border-gray-200 bg-white px-4 md:px-6 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto w-full">
          <AnimatePresence>
            {handsFreeMode && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl mb-3 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                  Hands-free mode active
                </span>
                <button onClick={onToggleHandsFree} className="text-red-700 hover:text-red-800 font-semibold text-sm">Disable</button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-3">
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <AttachmentChip key={attachment.filename} attachment={attachment}
                      onRemove={handleRemoveAttachment} onOpenPreview={handleOpenPreview} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2">
            <button 
              type="button" 
              onClick={handlePaperclipClick}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 border cursor-pointer flex-shrink-0 bg-white border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600 hover:scale-105 button-press"
              title="Attach document"
              aria-label="Attach document"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.docx,.csv" onChange={handleFileSelect} className="hidden" aria-hidden="true" />

            <button 
              type="button" 
              onClick={isListening ? onStopVoiceCapture : onStartVoiceCapture}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 border cursor-pointer flex-shrink-0 button-press ${
                isListening 
                  ? "bg-red-600 text-white border-red-600 shadow-sm hover:bg-red-700" 
                  : "bg-white border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600 hover:scale-105"
              }`}
              title={isListening ? "Stop listening" : "Start voice input"}
              aria-label={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <div className="flex-1 relative">
              <textarea 
                value={inputText} 
                onChange={(e) => onInputTextChange(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder="Message Talker AI..." 
                rows={1}
                className="w-full bg-white border border-gray-300 focus:border-red-500 rounded-xl py-3 pl-4 pr-14 text-sm text-gray-900 focus:outline-none transition-all duration-200 resize-none placeholder-gray-500 custom-scrollbar"
                disabled={loading}
                onInput={(e) => { 
                  const t = e.currentTarget; 
                  t.style.height = "auto"; 
                  t.style.height = Math.min(t.scrollHeight, 200) + "px"; 
                }}
                style={{ 
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgb(156, 163, 175) transparent'
                }}
                aria-label="Message input"
              />
              <button 
                onClick={handleSend} 
                disabled={loading || !inputText.trim()}
                className={`absolute right-2 bottom-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer button-press ${
                  inputText.trim() && !loading 
                    ? "bg-red-600 text-white hover:bg-red-700 hover:scale-110 shadow-sm" 
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
                aria-label="Send message"
                type="button"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-mono">Enter</kbd>
            <span>to send</span>
            <span className="text-gray-300">•</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-mono">Shift + Enter</kbd>
            <span>for new line</span>
          </div>
        </div>
      </div>

      <DocumentPreviewDrawer document={previewDocument} onClose={handleClosePreview} isOpen={previewDocumentId !== null} />
    </div>
  );
};
