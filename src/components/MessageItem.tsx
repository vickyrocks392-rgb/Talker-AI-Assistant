import React from "react";
// @ts-nocheck
import { Copy, Check, Search, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import { Message } from "../types";
import { formatMessageTime } from "../lib/date-utils";
import { InteractiveMap } from "./InteractiveMap";
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
  const hasCodeBlocks = msg.text.includes("```");

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
            <p>{msg.text}</p>
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
            {hasCodeBlocks && msg.text.trim().startsWith("```") && (
              <p className="text-zinc-300 mb-2">Here’s a code example:</p>
            )}
            <div className="text-zinc-100 mb-3">
              <MarkdownRenderer content={msg.text} />
            </div>

            {/* Dynamic Map Actions Integration */}
            {msg.mapAction && msg.mapAction.type !== "none" && (
              <div className="my-3">
                <InteractiveMap 
                  type={msg.mapAction.type} 
                  query={msg.mapAction.query} 
                  directions={msg.mapAction.directions} 
                />
              </div>
            )}

            {/* Google Search Citation Badges */}
            {msg.searchSources && msg.searchSources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-zinc-900/60 flex flex-col gap-1.5">
                <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase flex items-center gap-1">
                  <Search className="w-3 h-3 text-red-500" /> Grounded Search Sources:
                </span>
                <div className="flex flex-wrap gap-1">
                  {msg.searchSources.slice(0, 3).map((source, sIdx) => (
                    <a
                      key={sIdx}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-red-900/40 text-[10px] text-zinc-300 px-2 py-1 rounded-md transition flex items-center gap-1 max-w-[200px]"
                    >
                      <span className="truncate">{source.title}</span>
                      <ExternalLink className="w-2.5 h-2.5 text-zinc-500 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Control buttons */}
            <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-zinc-900/60">
              <button
                onClick={() => onCopy(msg.text, msg.messageId)}
                className="bg-black hover:bg-zinc-900 border border-zinc-900 px-2.5 py-1 rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer transition text-[10px] font-medium flex items-center gap-1"
                title="Copy Original text"
              >
                {copiedId === msg.messageId ? <Check className="w-3 h-3 text-red-500" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId === msg.messageId ? "Copied" : hasCodeBlocks ? "Copy Code" : "Copy Text"}</span>
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
