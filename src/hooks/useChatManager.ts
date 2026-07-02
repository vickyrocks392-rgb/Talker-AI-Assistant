/**
 * useChatManager — frontend conversation state manager.
 *
 * The backend (SQLite via MemoryService) is the single source of truth.
 * This hook never stores messages locally; it always fetches from the API.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { UserPersona } from "../types";
import type { Conversation, Message } from "../types";
import {
  fetchConversations,
  createConversation,
  getConversation,
  deleteConversation,
  sendChatMessage,
  sendChatMessageStream,
} from "../lib/api";

interface UseChatManagerProps {
  persona: UserPersona;
  onBotReply?: (replyText: string, messageId: string) => void;
}

export const useChatManager = ({
  persona,
  onBotReply,
}: UseChatManagerProps) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>("");

  const devScrollRef = useRef<HTMLDivElement | null>(null);

  // Helper: Scroll messages safely to the bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      devScrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 200);
  }, []);

  // ── Load conversation list on mount ──────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const list = await fetchConversations();

        if (cancelled) return;

        if (list.length > 0) {
          // Sort by updatedAt descending (most recent first)
          const sorted = [...list].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          setConversations(sorted);
          setActiveConversationId(sorted[0].id);
        } else {
          // No conversations exist — create one automatically
          const created = await createConversation();
          if (cancelled) return;
          setConversations([created]);
          setActiveConversationId(created.id);
        }
      } catch (err) {
        console.error("Failed to initialise conversations:", err);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch messages when active conversation changes ──────────────

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      try {
        const detail = await getConversation(activeConversationId);
        if (cancelled) return;

        // Map backend Message to frontend Message type
        const mapped: Message[] = detail.messages.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        }));

        setMessages(mapped);
        scrollToBottom();
      } catch (err) {
        console.error("Failed to load conversation messages:", err);
      }
    }

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, scrollToBottom]);

  // ── Refresh the active conversation from the backend ─────────────

  const refreshActiveConversation = useCallback(async () => {
    if (!activeConversationId) return;

    try {
      const [list, detail] = await Promise.all([
        fetchConversations(),
        getConversation(activeConversationId),
      ]);

      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setConversations(sorted);

      const mapped: Message[] = detail.messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }));

      setMessages(mapped);
    } catch (err) {
      console.error("Failed to refresh conversation:", err);
    }
  }, [activeConversationId]);

  // ── Create a new conversation ────────────────────────────────────

  const createNewSession = useCallback(async () => {
    try {
      const created = await createConversation();
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      setMessages([]);
    } catch (err) {
      console.error("Failed to create new conversation:", err);
    }
  }, []);

  // ── Delete a conversation ────────────────────────────────────────

  const deleteSession = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversation(conversationId);
        setConversations((prev) =>
          prev.filter((c) => c.id !== conversationId),
        );

        if (activeConversationId === conversationId) {
          // Select the next available conversation or create one
          const remaining = conversations.filter(
            (c) => c.id !== conversationId,
          );
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
          } else {
            const created = await createConversation();
            setConversations([created]);
            setActiveConversationId(created.id);
          }
        }
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [activeConversationId, conversations],
  );

  // ── Send a message ───────────────────────────────────────────────

  const sendMessageToBot = useCallback(
    async (textToSend: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed) return;

      // Determine which conversation to use
      let targetId = activeConversationId;

      // If no active conversation, create one on the fly
      if (!targetId) {
        try {
          const created = await createConversation();
          setConversations((prev) => [created, ...prev]);
          setActiveConversationId(created.id);
          targetId = created.id;
        } catch (err) {
          console.error("Failed to create conversation for message:", err);
          return;
        }
      }

      setInputText("");
      setLoading(true);

      // Optimistically add the user message to the UI
      const tempUserMsg: Message = {
        id: "temp_" + Math.random().toString(36).substring(2, 11),
        conversationId: targetId,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);
      scrollToBottom();

      try {
        // Send via streaming
        const result = await sendChatMessageStream(
          {
            text: trimmed,
            conversationId: targetId,
            persona,
            stream: true,
          },
          // onToken — we don't update UI per-token since we reload from backend
          () => {},
        );

        // After response, refresh from backend (source of truth)
        await refreshActiveConversation();

        setLoading(false);

        // Trigger voice callback if provided
        if (onBotReply) {
          const assistantMsgId = "msg_" + Math.random().toString(36).substring(2, 11);
          onBotReply(result.replyText, assistantMsgId);
        }
      } catch (err: any) {
        console.error("Chat API failed:", err);

        // Add a fallback error message
        const fallbackMsg: Message = {
          id: "err_" + Math.random().toString(36).substring(2, 11),
          conversationId: targetId,
          role: "assistant",
          content: `I am currently experiencing higher demand or connection spikes. Let me record and backup your query locally: "${trimmed}"`,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, fallbackMsg]);

        setLoading(false);

        if (onBotReply) {
          onBotReply(fallbackMsg.content, fallbackMsg.id);
        }
      }
    },
    [
      activeConversationId,
      persona,
      onBotReply,
      refreshActiveConversation,
      scrollToBottom,
    ],
  );

  return {
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    loading,
    inputText,
    setInputText,
    createNewSession,
    deleteSession,
    sendMessageToBot,
    devScrollRef,
    scrollToBottom,
  };
};