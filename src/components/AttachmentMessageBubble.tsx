/**
 * AttachmentMessageBubble — displays file attachments within a chat message.
 *
 * Premium UX similar to ChatGPT/Claude Projects:
 * - Clean file chip design with icon
 * - Click to preview (for indexed documents)
 * - Smooth animations
 * - Multiple attachments support
 * - Accessible with keyboard navigation
 */

import React from "react";
import { motion } from "motion/react";
import { FileText, X, Eye } from "lucide-react";
import type { ChatAttachment } from "../lib/api";

interface AttachmentMessageBubbleProps {
  attachments: ChatAttachment[];
  onPreview?: (documentId: string) => void;
  disabled?: boolean;
}

export const AttachmentMessageBubble: React.FC<AttachmentMessageBubbleProps> = ({
  attachments,
  onPreview,
  disabled = false,
}) => {
  if (!attachments || attachments.length === 0) return null;

  const handlePreview = (documentId: string, filename: string) => {
    if (onPreview && !disabled) {
      onPreview(documentId);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="flex flex-wrap gap-2 mt-2"
    >
      {attachments.map((attachment, index) => (
        <motion.div
          key={`${attachment.documentId}-${index}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15, delay: index * 0.03 }}
          className={`
            inline-flex items-center gap-2 px-3 py-2 rounded-lg border
            bg-white border-gray-200 text-gray-900
            ${onPreview && !disabled ? "cursor-pointer hover:border-red-300 hover:shadow-sm" : ""}
            transition-all duration-200
          `}
          onClick={() => handlePreview(attachment.documentId, attachment.filename)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handlePreview(attachment.documentId, attachment.filename);
            }
          }}
          tabIndex={onPreview && !disabled ? 0 : undefined}
          role={onPreview && !disabled ? "button" : undefined}
          aria-label={`${attachment.filename}${onPreview && !disabled ? ", click to preview" : ""}`}
          title={onPreview && !disabled ? "Click to preview" : attachment.filename}
        >
          <FileText className="w-4 h-4 text-gray-600 flex-shrink-0" />
          
          <span className="text-sm font-medium truncate max-w-[150px]">
            {attachment.filename}
          </span>

          {onPreview && !disabled && (
            <Eye className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 ml-0.5" />
          )}
        </motion.div>
      ))}
    </motion.div>
  );
};