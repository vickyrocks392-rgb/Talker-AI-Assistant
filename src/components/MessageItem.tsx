import React from "react";
// @ts-nocheck
import { Copy, Check, Volume2, Square } from "lucide-react";
import { motion } from "motion/react";
import type { Message } from "../types";
import { formatMessageTime } from "../lib/date-utils";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface MessageItemProps {
  msg: Message;
  index: number;
  speakingMessageId: string | null;
  copiedId: string | null;
  onSpeak: (text: string, id: string) => void;
  onCopy: (text: string, id: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  msg,
  index,
  speakingMessageId,
  copiedId,
  onSpeak,
  onCopy
}) => {
  const isUser = msg.role === "user";
  const hasCodeBlocks = msg.content.includes("```");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} mb-4 w-full`}
    >
      {/* User speech bubble */}
      {isUser ? (
        <>
          <div className="max-w-[85%] bg-red-600 text-white px-3.5 py-2.5 rounded-2xl rounded-tr-none shadow font-medium text-xs leading-normal font-sans">
            <p>{msg.content}</p>
          </div>
          <div className="flex items-center gap-2 mt-1 mr-1.5 select-none text-[9px] text-zinc-500 font-mono">
            <span>USER</span>
            {msg.createdAt && (
              <span>• {formatMessageTime(msg.createdAt)}</span>
            )}
          </div>
        </>
      ) : (
        /* Assistant Speech response bubble */
        <>
          <div className="max-w-[95%] bg-zinc-950 border border-zinc-900 p-4 rounded-2xl rounded-tl-none text-xs leading-normal">
            {/* Answer text */}
            {hasCodeBlocks && msg.content.trim().startsWith("```") && (
              <p className="text-zinc-300 mb-2">Here's a code example:</p>
            )}
            <div className="text-zinc-100 mb-3">
              <MarkdownRenderer content={msg.content} />
            </div>

            {/* Control buttons */}
            <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-zinc-900/60">
              <button
                onClick={() => onSpeak(msg.content, msg.id)}
                className={`bg-black hover:bg-zinc-900 border px-2.5 py-1 rounded-lg cursor-pointer transition text-[10px] font-medium flex items-center gap-1 ${
                  speakingMessageId === msg.id
                    ? "border-red-500 text-red-400"
                    : "border-zinc-900 text-zinc-400 hover:text-zinc-200"
                }`}
                title={speakingMessageId === msg.id ? "Stop speaking" : "Read aloud"}
              >
                {speakingMessageId === msg.id ? (
                  <><Square className="w-3 h-3" /><span>Stop</span></>
                ) : (
                  <><Volume2 className="w-3 h-3" /><span>Listen</span></>
                )}
              </button>
              <button
                onClick={() => onCopy(msg.content, msg.id)}
                className="bg-black hover:bg-zinc-900 border border-zinc-900 px-2.5 py-1 rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer transition text-[10px] font-medium flex items-center gap-1"
                title="Copy Original text"
              >
                {copiedId === msg.id ? <Check className="w-3 h-3 text-red-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId === msg.id ? "Copied" : hasCodeBlocks ? "Copy Code" : "Copy Text"}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1 ml-1.5 select-none text-[9px] text-zinc-500 font-mono">
            <span>ASSISTANT</span>
            {msg.createdAt && (
              <span>• {formatMessageTime(msg.createdAt)}</span>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};