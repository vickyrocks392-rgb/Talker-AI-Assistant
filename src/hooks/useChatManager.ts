/**
 * useChatManager — frontend conversation state manager.
 *
 * The backend (SQLite via MemoryService) is the single source of truth.
 * This hook never stores messages locally; it always fetches from the API.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { UserPersona } from "../types";
import type { Conversation, Message } from "../types";
import type { ChatAttachment, AIMonitorDTO } from "../lib/api";
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
  const [aiMonitorData, setAiMonitorData] = useState<AIMonitorDTO | null>(null);

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

        // Map backend Message to frontend Message type (including attachments)
        const mapped: Message[] = detail.messages.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          attachments: m.attachments,
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
    try {
      const [list, detail] = await Promise.all([
        fetchConversations(),
        activeConversationId ? getConversation(activeConversationId) : null,
      ]);

      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setConversations(sorted);

      if (detail && activeConversationId) {
        // Map backend Message to frontend Message type (including attachments)
        const mapped: Message[] = detail.messages.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
          attachments: m.attachments,
        }));

        setMessages(mapped);
      }
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
    async (textToSend: string, attachments?: ChatAttachment[]) => {
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

      // Optimistically add the user message to the UI with attachments
      const tempUserMsg: Message = {
        id: "temp_" + Math.random().toString(36).substring(2, 11),
        conversationId: targetId,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
        attachments: attachments?.length ? [...attachments] : undefined,
      };
      setMessages((prev) => [...prev, tempUserMsg]);
      scrollToBottom();

      try {
        // Send via streaming with attachments
        const result = await sendChatMessageStream(
          {
            text: trimmed,
            conversationId: targetId,
            persona,
            stream: true,
            attachments: attachments ?? [],
          },
          // onToken — we don't update UI per-token since we reload from backend
          () => {},
        );

        // Capture AI Monitor data from the response
        console.log("[AI Monitor DEBUG] useChatManager result.aiMonitor:", result.aiMonitor);
        if (result.aiMonitor) {
          setAiMonitorData(result.aiMonitor);
          console.log("[AI Monitor DEBUG] useChatManager setAiMonitorData called");
          
          // Dispatch events for sidebar auto-expand based on AI monitor data
          if (result.aiMonitor.memory && result.aiMonitor.memory.entryCount > 0) {
            const memoryEvent = new CustomEvent('memory-retrieved');
            window.dispatchEvent(memoryEvent);
          }
          
          if (result.aiMonitor.rag && (result.aiMonitor.rag.chunkCount > 0 || result.aiMonitor.rag.activeDocCount > 0)) {
            const ragEvent = new CustomEvent('rag-retrieval');
            window.dispatchEvent(ragEvent);
          }
          
          if (result.aiMonitor.tools && result.aiMonitor.tools.executionCount > 0) {
            const toolEvent = new CustomEvent('tool-executed');
            window.dispatchEvent(toolEvent);
          }
        } else {
          console.log("[AI Monitor DEBUG] useChatManager result.aiMonitor is undefined");
        }

        // After response, refresh from backend (source of truth)
        console.log(`[TitleGenerator] About to refresh conversation list`);
        await refreshActiveConversation();
        console.log(`[TitleGenerator] Conversation list refreshed. Current conversations:`, conversations.map(c => ({ id: c.id, title: c.title, titleGenerated: c.titleGenerated })));
        
        // Re-fetch conversations directly to log the full list
        const freshList = await (await fetch("/api/conversations")).json();
        console.log(`[TitleGenerator] Frontend received conversation list:`, JSON.stringify(freshList.map((c: any) => ({ id: c.id, title: c.title, titleGenerated: c.titleGenerated })), null, 2));

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
    aiMonitorData,
  };
};