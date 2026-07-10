/**
 * AttachmentChip — displays a single attached document above the message composer.
 *
 * Visually distinct from Knowledge Center document cards.
 * Shows upload progress, indexing progress, indexed state, and a remove button.
 * Clicking the filename opens the document preview drawer.
 */

import React from "react";
import { motion } from "motion/react";
import { FileText, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

export type AttachmentStatus = "uploading" | "indexing" | "indexed" | "error";

export interface Attachment {
  documentId: string | null;
  filename: string;
  status: AttachmentStatus;
  progress: number;
  errorMessage?: string;
}

interface AttachmentChipProps {
  attachment: Attachment;
  onRemove: (filename: string) => void;
  onOpenPreview: (documentId: string) => void;
}

export const AttachmentChip: React.FC<AttachmentChipProps> = ({
  attachment,
  onRemove,
  onOpenPreview,
}) => {
  const { filename, status, progress, documentId } = attachment;

  const handleClick = () => {
    if (documentId && status === "indexed") {
      onOpenPreview(documentId);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "uploading":
      case "indexing":
        return <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />;
      case "indexed":
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
      case "error":
        return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "uploading":
        return `Uploading ${progress}%`;
      case "indexing":
        return "Indexing...";
      case "indexed":
        return "✓ Indexed";
      case "error":
        return "Upload failed";
    }
  };

  const showProgress =
    (status === "uploading" || status === "indexing") && documentId === null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs
        ${
          status === "indexed"
            ? "bg-green-50 border-green-200 text-green-800"
            : status === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
        }
        ${
          documentId && status === "indexed"
            ? "cursor-pointer hover:shadow-sm"
            : ""
        }
        transition-shadow
      `}
      onClick={handleClick}
      title={
        documentId && status === "indexed"
          ? "Click to preview"
          : status === "error"
            ? attachment.errorMessage || "Upload failed"
            : undefined
      }
    >
      <FileText className="w-3.5 h-3.5 flex-shrink-0" />

      <span className="font-medium truncate max-w-[120px]">{filename}</span>

      <span className="text-[10px] opacity-75 ml-0.5 whitespace-nowrap">
        {getStatusLabel()}
      </span>

      {showProgress && (
        <div className="w-12 h-1 bg-amber-200/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {getStatusIcon()}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(filename);
        }}
        className="p-0.5 rounded hover:bg-black/10 transition-colors flex-shrink-0 ml-0.5"
        title="Remove attachment"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
};