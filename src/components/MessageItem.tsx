import React from "react";
import { Copy, Check, Volume2, Square } from "lucide-react";
import { motion } from "motion/react";
import type { Message } from "../types";
import { formatMessageTime } from "../lib/date-utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { RagIndicator } from "./RagIndicator";
import { AttachmentMessageBubble } from "./AttachmentMessageBubble";
import type { ChatAttachment } from "../lib/api";

interface MessageItemProps {
  msg: Message;
  index: number;
  speakingMessageId: string | null;
  copiedId: string | null;
  onSpeak: (text: string, id: string) => void;
  onCopy: (text: string, id: string) => void;
  attachments?: ChatAttachment[];
  onPreviewAttachment?: (documentId: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  msg,
  index,
  speakingMessageId,
  copiedId,
  onSpeak,
  onCopy,
  attachments,
  onPreviewAttachment
}) => {
  const isUser = msg.role === "user";
  const hasCodeBlocks = msg.content.includes("```");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} mb-6 w-full message-premium`}
    >
      {/* User message */}
      {isUser ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="max-w-[80%] md:max-w-[70%]"
        >
          <div className="bg-red-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm shadow-sm hover:shadow-md transition-all duration-200">
            {attachments && attachments.length > 0 && (
              <AttachmentMessageBubble
                attachments={attachments}
                onPreview={onPreviewAttachment}
                disabled={!onPreviewAttachment}
              />
            )}
            {msg.content && (
              <p className="text-sm leading-relaxed">{msg.content}</p>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 mr-1 select-none text-[11px] text-gray-500">
            <span>You</span>
            {msg.createdAt && (
              <>
                <span>•</span>
                <span>{formatMessageTime(msg.createdAt)}</span>
              </>
            )}
          </div>
        </motion.div>
      ) : (
        /* Assistant message */
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="max-w-[85%] md:max-w-[80%]"
        >
          {/* RAG Context Indicator */}
          {msg.ragContext && (
            <RagIndicator
              used={msg.ragContext.used}
              documentsSearched={msg.ragContext.documentsSearched}
              contextType={msg.ragContext.contextType}
            />
          )}
          
          <div className="bg-white border border-gray-200 p-5 rounded-2xl rounded-tl-sm shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200">
            {/* Answer text */}
            {hasCodeBlocks && msg.content.trim().startsWith("```") && (
              <p className="text-sm text-gray-600 mb-3">Here's a code example:</p>
            )}
            <div className="text-sm text-gray-900 leading-relaxed">
              <MarkdownRenderer content={msg.content} />
            </div>

            {/* Control buttons */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSpeak(msg.content, msg.id)}
                className={`px-3 py-1.5 rounded-lg border cursor-pointer transition-all duration-200 text-xs font-medium flex items-center gap-1.5 button-press ${
                  speakingMessageId === msg.id
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300"
                }`}
                title={speakingMessageId === msg.id ? "Stop speaking" : "Read aloud"}
              >
                {speakingMessageId === msg.id ? (
                  <><Square className="w-3.5 h-3.5" /><span>Stop</span></>
                ) : (
                  <><Volume2 className="w-3.5 h-3.5" /><span>Listen</span></>
                )}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onCopy(msg.content, msg.id)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 cursor-pointer transition-all duration-200 text-xs font-medium flex items-center gap-1.5 bg-white button-press"
                title="Copy text"
              >
                {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-red-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === msg.id ? "Copied" : "Copy"}</span>
              </motion.button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1.5 ml-1 select-none text-[11px] text-gray-500">
            <span>Assistant</span>
            {msg.createdAt && (
              <>
                <span>•</span>
                <span>{formatMessageTime(msg.createdAt)}</span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};