import React, { useMemo } from "react";
import { Search, X, Trash2, Brain } from "lucide-react";
import type { Conversation, Message } from "../types";

interface ChatSessionsStripProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectChat: (conversationId: string) => void;
  messages: Message[];
  onCreateSession: () => void;
  onDeleteSession: (conversationId: string) => void;
}

export const ChatSessionsStrip: React.FC<ChatSessionsStripProps> = ({
  conversations,
  activeConversationId,
  onSelectChat,
  messages,
  onCreateSession,
  onDeleteSession
}) => {
  const [searchQuery, setSearchQuery] = React.useState<string>("");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;

    const queryLower = searchQuery.toLowerCase().trim();

    return conversations.filter(conv => {
      // 1. Check if the conversation title matches the search query
      if (conv.title && conv.title.toLowerCase().includes(queryLower)) {
        return true;
      }

      // 2. Check if any message in the current messages matches
      return messages.some(msg => {
        return msg.content && msg.content.toLowerCase().includes(queryLower);
      });
    });
  }, [conversations, messages, searchQuery]);

  return (
    <div className="flex-shrink-0 flex flex-col gap-2 mb-2 w-full select-none">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold font-mono">
          Saved Conversations
        </span>
        <button
          onClick={onCreateSession}
          className="text-red-500 text-[10px] hover:text-red-400 flex items-center gap-1 cursor-pointer transition bg-red-950/20 border border-red-500/20 px-2 py-1 rounded-md uppercase font-bold tracking-wider"
        >
          + New Session
        </button>
      </div>

      {/* Search bar inside the sessions list */}
      <div className="relative mb-2.5 flex items-center">
        <Search className="absolute left-3 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories & topics..."
          className="w-full pl-9 pr-8 py-2 text-xs bg-black border border-zinc-900 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500/40 transition font-sans"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 p-0.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer"
            title="Clear Search"
          >
            <X className="w-3" />
          </button>
        )}
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 select-none no-scrollbar max-h-[calc(100vh-220px)] md:max-h-[calc(100vh-260px)] pr-1">
        {filtered.map((conv) => {
          const queryLower = searchQuery.toLowerCase().trim();
          const matchedMsg = searchQuery.trim() ? messages.find(msg => {
            return msg.content && msg.content.toLowerCase().includes(queryLower);
          }) : null;

          return (
            <div
              key={conv.id}
              onClick={() => onSelectChat(conv.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer group transition duration-200 relative ${
                activeConversationId === conv.id 
                  ? "bg-zinc-900 border-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.06)]" 
                  : "bg-black border-zinc-950 text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeConversationId === conv.id ? "bg-red-500 animate-pulse" : "bg-zinc-700"}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-sans font-medium block truncate">
                    {conv.title}
                  </span>
                  {matchedMsg && (
                    <span className="block text-[9px] text-red-400 font-mono italic truncate mt-0.5">
                      ↳ match: "{matchedMsg.content}"
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(conv.id);
                }}
                className="text-zinc-600 hover:text-red-400 p-1 rounded-md hover:bg-zinc-900 ml-2 opacity-0 group-hover:opacity-100 transition duration-150 cursor-pointer flex-shrink-0"
                title="Delete Session"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-[11px] text-zinc-500 py-4 text-center font-mono bg-zinc-950/20 rounded-xl border border-dashed border-zinc-900">
            {searchQuery.trim() ? "No matching sessions found." : "No saved chats yet. Start one above!"}
          </p>
        )}
      </div>
    </div>
  );
};