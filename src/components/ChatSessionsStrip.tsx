import React from "react";
import { Search, X, Trash2, Brain } from "lucide-react";
import { ChatSession, Message } from "../types";

interface ChatSessionsStripProps {
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  allMessages: Record<string, Message[]>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (chatId: string) => void;
}

export const ChatSessionsStrip: React.FC<ChatSessionsStripProps> = ({
  chats,
  activeChatId,
  onSelectChat,
  allMessages,
  searchQuery,
  onSearchChange,
  onCreateSession,
  onDeleteSession
}) => {
  const getFilteredChats = () => {
    if (!searchQuery.trim()) return chats;

    const queryLower = searchQuery.toLowerCase().trim();

    return chats.filter(chat => {
      // 1. Check if the chat title matches the search query
      if (chat.title && chat.title.toLowerCase().includes(queryLower)) {
        return true;
      }

      // 2. Check if any message in this chat matches the search query
      const chatMsgs = allMessages[chat.chatId] || [];
      return chatMsgs.some(msg => {
        return msg.text && msg.text.toLowerCase().includes(queryLower);
      });
    });
  };

  const filtered = getFilteredChats();

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
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search memories & topics..."
          className="w-full pl-9 pr-8 py-2 text-xs bg-black border border-zinc-900 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500/40 transition font-sans"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 p-0.5 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 cursor-pointer"
            title="Clear Search"
          >
            <X className="w-3" />
          </button>
        )}
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 select-none no-scrollbar max-h-[calc(100vh-220px)] md:max-h-[calc(100vh-260px)] pr-1">
        {filtered.map((chat) => {
          const chatMsgs = allMessages[chat.chatId] || [];
          const queryLower = searchQuery.toLowerCase().trim();
          const matchedMsg = searchQuery.trim() ? chatMsgs.find(msg => {
            return msg.text && msg.text.toLowerCase().includes(queryLower);
          }) : null;

          return (
            <div
              key={chat.chatId}
              onClick={() => onSelectChat(chat.chatId)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer group transition duration-200 relative ${
                activeChatId === chat.chatId 
                  ? "bg-zinc-900 border-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.06)]" 
                  : "bg-black border-zinc-950 text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeChatId === chat.chatId ? "bg-red-500 animate-pulse" : "bg-zinc-700"}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-sans font-medium block truncate">
                    {chat.title}
                  </span>
                  {matchedMsg && (
                    <span className="block text-[9px] text-red-400 font-mono italic truncate mt-0.5">
                      ↳ match: "{matchedMsg.text}"
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(chat.chatId);
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
