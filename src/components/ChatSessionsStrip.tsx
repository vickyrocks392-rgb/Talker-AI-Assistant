import React, { useMemo } from "react";
import { motion } from "motion/react";
import { Search, X, Trash2, Plus, MessageSquare, BookOpen, Sparkles, Lightbulb, FileText, MessageCircle } from "lucide-react";
import type { Conversation, Message } from "../types";

interface ChatSessionsStripProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectChat: (conversationId: string) => void;
  messages: Message[];
  onCreateSession: () => void;
  onDeleteSession: (conversationId: string) => void;
  loading?: boolean;
  showOnboarding?: boolean;
  onDismissOnboarding?: () => void;
}

export const ChatSessionsStrip: React.FC<ChatSessionsStripProps> = ({
  conversations,
  activeConversationId,
  onSelectChat,
  messages,
  onCreateSession,
  onDeleteSession,
  loading = false,
  showOnboarding = false,
  onDismissOnboarding,
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
    <div className="flex flex-col gap-3 w-full select-none">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your Noryx conversations..."
          className="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:border-red-500 focus:bg-white input-premium"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-700 cursor-pointer transition button-press"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Onboarding card for first-time users */}
      {showOnboarding && conversations.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="p-4 rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-orange-50 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Welcome to Noryx</h3>
              <p className="text-[11px] text-gray-500">Your private AI workspace</p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-3 leading-relaxed">
            Try asking:
          </p>
          <div className="space-y-1.5">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onCreateSession();
                // Small delay to let the conversation be created
                setTimeout(() => {
                  const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="message"]');
                  if (input) {
                    input.value = "Summarize my resume";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }, 300);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 hover:bg-white border border-red-100 text-xs text-gray-700 hover:text-gray-900 transition-all duration-200 cursor-pointer card-premium"
            >
              <FileText className="w-3.5 h-3.5 text-red-500" />
              Summarize my resume
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onCreateSession();
                setTimeout(() => {
                  const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="message"]');
                  if (input) {
                    input.value = "Compare these two documents";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }, 300);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 hover:bg-white border border-red-100 text-xs text-gray-700 hover:text-gray-900 transition-all duration-200 cursor-pointer card-premium"
            >
              <BookOpen className="w-3.5 h-3.5 text-red-500" />
              Compare documents
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onCreateSession();
                setTimeout(() => {
                  const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="message"]');
                  if (input) {
                    input.value = "Explain this architecture";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }, 300);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 hover:bg-white border border-red-100 text-xs text-gray-700 hover:text-gray-900 transition-all duration-200 cursor-pointer card-premium"
            >
              <Lightbulb className="w-3.5 h-3.5 text-red-500" />
              Explain this architecture
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onCreateSession();
                setTimeout(() => {
                  const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="message"]');
                  if (input) {
                    input.value = "Search my uploaded files";
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }, 300);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 hover:bg-white border border-red-100 text-xs text-gray-700 hover:text-gray-900 transition-all duration-200 cursor-pointer card-premium"
            >
              <Search className="w-3.5 h-3.5 text-red-500" />
              Search my uploaded files
            </motion.button>
          </div>
          {onDismissOnboarding && (
            <button
              onClick={onDismissOnboarding}
              className="mt-3 w-full text-[11px] text-gray-400 hover:text-gray-600 transition cursor-pointer text-center"
            >
              Dismiss
            </button>
          )}
        </motion.div>
      )}

      {/* Sessions list */}
      <div className="flex flex-col gap-1.5">
        {loading ? (
          // Premium skeleton loading
          Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={`skeleton-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="p-3.5 rounded-xl border border-gray-200 bg-white space-y-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg skeleton-premium flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 skeleton-premium w-3/4" />
                  <div className="h-2.5 skeleton-premium w-1/2" />
                </div>
              </div>
            </motion.div>
          ))
        ) : filtered.length === 0 && !showOnboarding ? (
          // Premium empty state
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-10 px-4"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {searchQuery.trim() ? "No conversations found" : "No Conversations Yet"}
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              {searchQuery.trim()
                ? "Try a different search term"
                : "Start a conversation to begin building your workspace."
              }
            </p>
            {!searchQuery.trim() && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCreateSession}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer btn-premium"
              >
                <Plus className="w-4 h-4" />
                Start a conversation
              </motion.button>
            )}
          </motion.div>
        ) : (
          filtered.map((conv, index) => {
            const isActive = activeConversationId === conv.id;
            const messageCount = messages.filter(m => m.conversationId === conv.id).length;
            const lastMessage = messages.filter(m => m.conversationId === conv.id).slice(-1)[0];

            return (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.2 }}
                onClick={() => onSelectChat(conv.id)}
                className={`group relative p-3.5 rounded-xl border cursor-pointer card-premium ${
                  isActive
                    ? "bg-red-50 border-red-200 shadow-sm"
                    : "bg-white border-gray-200"
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
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(conv.id);
                    }}
                    className="delete-btn p-1.5 rounded-lg hover:bg-red-50 text-gray-400 cursor-pointer flex-shrink-0"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </motion.button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};