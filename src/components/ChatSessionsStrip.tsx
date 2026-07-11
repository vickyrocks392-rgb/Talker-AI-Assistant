import React, { useMemo } from "react";
import { Search, X, Trash2, Plus, MessageSquare, BookOpen } from "lucide-react";
import type { Conversation, Message } from "../types";

interface ChatSessionsStripProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectChat: (conversationId: string) => void;
  messages: Message[];
  onCreateSession: () => void;
  onDeleteSession: (conversationId: string) => void;
  loading?: boolean;
}

export const ChatSessionsStrip: React.FC<ChatSessionsStripProps> = ({
  conversations,
  activeConversationId,
  onSelectChat,
  messages,
  onCreateSession,
  onDeleteSession,
  loading = false
}) => {
  const [searchQuery, setSearchQuery] = React.useState<string>("");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;

    const queryLower = searchQuery.toLowerCase().trim();

    return conversations.filter(conv => {
      if (conv.title && conv.title.toLowerCase().includes(queryLower)) {
        return true;
      }

      return messages.some(msg => {
        return msg.content && msg.content.toLowerCase().includes(queryLower);
      });
    });
  }, [conversations, messages, searchQuery]);

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex-shrink-0 flex flex-col gap-3 w-full select-none">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-red-500 focus:bg-white transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-700 cursor-pointer transition"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 no-scrollbar">
        {loading ? (
          // Show skeletons while loading
          Array.from({ length: 5 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="p-3.5 rounded-xl border border-gray-200 bg-white space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded animate-pulse w-3/4" />
                  <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/2" />
                </div>
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-gray-500">
              {searchQuery.trim() ? "No conversations found" : "No conversations yet"}
            </p>
            {!searchQuery.trim() && (
              <button
                onClick={onCreateSession}
                className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium transition"
              >
                Start your first conversation
              </button>
            )}
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = activeConversationId === conv.id;
            const messageCount = messages.filter(m => m.conversationId === conv.id).length;
            const lastMessage = messages.filter(m => m.conversationId === conv.id).slice(-1)[0];

            return (
              <div
                key={conv.id}
                onClick={() => onSelectChat(conv.id)}
                className={`group relative p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                  isActive
                    ? "bg-red-50 border-red-200 shadow-sm"
                    : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <h3 className={`text-sm font-medium truncate ${isActive ? "text-gray-900" : "text-gray-700"}`}>
                        {conv.title || "New Conversation"}
                      </h3>
                    </div>
                    {lastMessage && (
                      <p className="text-xs text-gray-500 truncate mb-2">
                        {lastMessage.content}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                      <span>{formatTimeAgo(conv.updatedAt)}</span>
                      {messageCount > 0 && (
                        <>
                          <span className="text-gray-300">•</span>
                          <span>{messageCount} {messageCount === 1 ? "msg" : "msgs"}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all duration-200 cursor-pointer flex-shrink-0"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
