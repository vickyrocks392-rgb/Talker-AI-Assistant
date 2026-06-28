import { useState, useEffect, useRef, useCallback } from "react";
import { User } from "firebase/auth";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  doc,
  serverTimestamp,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { ChatSession, Message, UserPersona } from "../types";
import { handleFirestoreError, OperationType } from "../lib/firestore-error-handler";

interface UseChatManagerProps {
  currentUser: User | null;
  authLoading: boolean;
  persona: UserPersona;
  onBotReply?: (replyText: string, messageId: string) => void;
}

export const useChatManager = ({
  currentUser,
  authLoading,
  persona,
  onBotReply,
}: UseChatManagerProps) => {
  // Sync offline-only cache from Local Storage on boot
  const [localChats, setLocalChats] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem("talker_local_chats");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [localMessages, setLocalMessages] = useState<Record<string, Message[]>>(() => {
    try {
      const saved = localStorage.getItem("talker_local_msgs");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>("");

  const devScrollRef = useRef<HTMLDivElement | null>(null);

  // Helper: Scroll messages safely to the bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      devScrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 1200);
  }, []);

  // Helper: Sync Local Storage
  const saveToLocalStorage = useCallback((newChats: ChatSession[], newMsgs: Record<string, Message[]>) => {
    localStorage.setItem("talker_local_chats", JSON.stringify(newChats));
    localStorage.setItem("talker_local_msgs", JSON.stringify(newMsgs));
    setLocalChats(newChats);
    setLocalMessages(newMsgs);
  }, []);

  // 1. Sync Chat Sessions List
  useEffect(() => {
    if (authLoading) return;

    if (currentUser) {
      const chatsPath = "chats";
      const q = query(
        collection(db, chatsPath),
        orderBy("updatedAt", "desc")
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const docs: ChatSession[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            // Map Firestore document data safely
            docs.push({
              chatId: data.chatId,
              userId: data.userId,
              title: data.title,
              mode: data.mode || "chat",
              summarized: data.summarized,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            } as ChatSession);
          });
          setChats(docs);

          // Auto select first chat if activeChatId is null
          if (docs.length > 0 && !activeChatId) {
            setActiveChatId(docs[0].chatId);
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, chatsPath);
        }
      );

      return () => unsubscribe();
    } else {
      setChats(localChats);
      if (localChats.length > 0 && !activeChatId) {
        setActiveChatId(localChats[0].chatId);
      }
    }
  }, [currentUser, authLoading, localChats, activeChatId]);

  // 2. Sync Active Session Messages
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    if (currentUser) {
      const messagesPath = `chats/${activeChatId}/messages`;
      const q = query(collection(db, messagesPath), orderBy("createdAt", "asc"));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const msgs: Message[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            msgs.push({
              messageId: data.messageId,
              userId: data.userId,
              role: data.role,
              text: data.text,
              mapAction: data.mapAction,
              searchSources: data.searchSources,
              createdAt: data.createdAt,
            } as Message);
          });
          setMessages(msgs);
          scrollToBottom();
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, messagesPath);
        }
      );

      return () => unsubscribe();
    } else {
      const msgs = localMessages[activeChatId] || [];
      setMessages(msgs);
      scrollToBottom();
    }
  }, [activeChatId, currentUser, localMessages, scrollToBottom]);

  // 3. Synchronize All Messages for Search Indexing
  useEffect(() => {
    if (authLoading) return;

    if (!currentUser) {
      setAllMessages(localMessages);
      return;
    }

    const activeChatIds = chats.map((c) => c.chatId);

    // Filter out old keys
    setAllMessages((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (!activeChatIds.includes(id)) {
          delete next[id];
        }
      });
      return next;
    });

    const unsubscribes = chats.map((chat) => {
      const messagesPath = `chats/${chat.chatId}/messages`;
      const q = query(collection(db, messagesPath), orderBy("createdAt", "asc"));

      return onSnapshot(
        q,
        (snapshot) => {
          const msgs: Message[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            msgs.push({
              messageId: data.messageId,
              userId: data.userId,
              role: data.role,
              text: data.text,
              mapAction: data.mapAction,
              searchSources: data.searchSources,
              createdAt: data.createdAt,
            } as Message);
          });
          setAllMessages((prev) => ({
            ...prev,
            [chat.chatId]: msgs,
          }));
        },
        (err) => {
          console.warn("Could not load messages for search indexing:", chat.chatId, err);
        }
      );
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [chats, currentUser, authLoading, localMessages]);

  // Sync Local Storage to Firestore upon Successful Login to Avoid Guest Data Loss
  const migrateLocalDataToCloud = useCallback(async (uid: string) => {
    if (localChats.length === 0) return;

    try {
      const batch = writeBatch(db);

      for (const chat of localChats) {
        const chatRef = doc(db, "chats", chat.chatId);
        batch.set(chatRef, {
          ...chat,
          userId: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const chatMsgs = localMessages[chat.chatId] || [];
        for (const msg of chatMsgs) {
          const msgRef = doc(db, `chats/${chat.chatId}/messages`, msg.messageId);
          batch.set(msgRef, {
            ...msg,
            userId: uid,
            createdAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();

      // Clear local state cleanly
      localStorage.removeItem("talker_local_chats");
      localStorage.removeItem("talker_local_msgs");
      setLocalChats([]);
      setLocalMessages({});
    } catch (e) {
      console.error("Failed to migrate guest data to Cloud:", e);
    }
  }, [localChats, localMessages]);

  // Create standard Session Title Summarizer
  const summarizeSessionText = async (targetId: string, allMsgs: Message[]) => {
    if (allMsgs.length < 2) return;

    try {
      const payload = allMsgs.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const customKey = localStorage.getItem("custom_ollama_api_key") || "";
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(customKey ? { "x-ollama-key": customKey } : {})
        },
        body: JSON.stringify({ messages: payload }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.summary) {
          if (currentUser) {
            try {
              await setDoc(
                doc(db, "chats", targetId),
                {
                  title: data.summary,
                  summarized: true,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `chats/${targetId}`);
            }
          } else {
            const updatedChats = localChats.map((c) =>
              c.chatId === targetId
                ? { ...c, title: data.summary, summarized: true, updatedAt: new Date() }
                : c
            );
            saveToLocalStorage(updatedChats, { ...localMessages, [targetId]: allMsgs });
          }
        }
      }
    } catch (err) {
      console.warn("Generating session summary failed:", err);
    }
  };

  // Create Session
  const createNewSession = async () => {
    const uid = currentUser?.uid || "guest_user";
    const newChatId = "chat_" + Math.random().toString(36).substring(2, 11);

    const newChat: ChatSession = {
      chatId: newChatId,
      userId: uid,
      title: `Saved Conversation ${chats.length + 1}`,
      mode: "chat",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (currentUser) {
      const chatPath = `chats/${newChatId}`;
      try {
        await setDoc(doc(db, "chats", newChatId), {
          ...newChat,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setActiveChatId(newChatId);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, chatPath);
      }
    } else {
      const updatedChats = [newChat, ...localChats];
      const updatedMsgs = { ...localMessages, [newChatId]: [] };
      saveToLocalStorage(updatedChats, updatedMsgs);
      setActiveChatId(newChatId);
    }
  };

  // Delete specific session
  const deleteSession = async (chatId: string) => {
    if (currentUser) {
      try {
        await deleteDoc(doc(db, "chats", chatId));
        if (activeChatId === chatId) {
          setActiveChatId(null);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `chats/${chatId}`);
      }
    } else {
      const updatedChats = localChats.filter((c) => c.chatId !== chatId);
      const updatedMsgs = { ...localMessages };
      delete updatedMsgs[chatId];
      saveToLocalStorage(updatedChats, updatedMsgs);
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    }
  };

  // Send Message Core Pipeline
  const sendMessageToBot = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return null;

    let targetChatId = activeChatId;

    // Create session on-the-fly if missing
    if (!targetChatId) {
      const newSessionId = "chat_" + Math.random().toString(36).substring(2, 11);
      const uid = currentUser?.uid || "guest_user";
      const newChat: ChatSession = {
        chatId: newSessionId,
        userId: uid,
        title: trimmed.length > 20 ? trimmed.substring(0, 20) + "..." : trimmed,
        mode: "chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (currentUser) {
        await setDoc(doc(db, "chats", newSessionId), {
          ...newChat,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const updatedChats = [newChat, ...localChats];
        const updatedMsgs = { ...localMessages, [newSessionId]: [] };
        saveToLocalStorage(updatedChats, updatedMsgs);
      }
      targetChatId = newSessionId;
      setActiveChatId(newSessionId);
    }

    const userMessageId = "msg_user_" + Math.random().toString(36).substring(2, 11);
    const userMessage: Message = {
      messageId: userMessageId,
      userId: currentUser?.uid || "guest_user",
      role: "user",
      text: trimmed,
      createdAt: new Date(),
    };

    // Store user message immediately
    if (currentUser) {
      try {
        await setDoc(doc(db, `chats/${targetChatId}/messages`, userMessageId), {
          ...userMessage,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `chats/${targetChatId}/messages/${userMessageId}`);
      }
    } else {
      const chatMsgs = localMessages[targetChatId] || [];
      const updatedMsgs = {
        ...localMessages,
        [targetChatId]: [...chatMsgs, userMessage],
      };
      saveToLocalStorage(localChats, updatedMsgs);
    }

    setInputText("");
    setLoading(true);

    // Prepare transcript history context (last 12 items for context limit buffer)
    const currentMsgs = messages.length > 0 ? messages : (localMessages[targetChatId] || []);
    const historyPayload = currentMsgs.slice(-12).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    try {
      const customKey = localStorage.getItem("custom_ollama_api_key") || "";
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(customKey ? { "x-ollama-key": customKey } : {})
        },
        body: JSON.stringify({
          text: trimmed,
          history: historyPayload,
          persona: persona,
        }),
      });

      if (!response.ok) {
        throw new Error("Companion brain temporary interruption. Retrying...");
      }

      const replyData = await response.json();
      const assistantMsgId = "msg_ai_" + Math.random().toString(36).substring(2, 11);

      // Create assistant message object
      const assistantMessage: Message = {
        messageId: assistantMsgId,
        userId: currentUser?.uid || "guest_user",
        role: "assistant",
        text: replyData.replyText,
        mapAction: replyData.mapAction,
        searchSources: replyData.searchSources,
        createdAt: new Date(),
      };

      let finalMessagesForSummary: Message[] = [];

      if (currentUser) {
        try {
          await setDoc(doc(db, `chats/${targetChatId}/messages`, assistantMsgId), {
            ...assistantMessage,
            createdAt: serverTimestamp(),
          });
          finalMessagesForSummary = [...messages, assistantMessage];
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `chats/${targetChatId}/messages/${assistantMsgId}`);
        }
      } else {
        const chatMsgs = localMessages[targetChatId] || [];
        const withAI = [...chatMsgs, userMessage, assistantMessage];
        const updatedMsgs = {
          ...localMessages,
          [targetChatId]: withAI,
        };

        saveToLocalStorage(localChats, updatedMsgs);
        finalMessagesForSummary = withAI;
      }

      setLoading(false);

      // Trigger standard verbal reply synthesis callback if provided
      if (onBotReply) {
        onBotReply(replyData.replyText, assistantMsgId);
      }

      // Automatically compile conversation summary if required
      const currentChat = (currentUser ? chats : localChats).find((c) => c.chatId === targetChatId);
      if (currentChat && !currentChat.summarized && finalMessagesForSummary.length >= 2) {
        summarizeSessionText(targetChatId, finalMessagesForSummary);
      }

      return assistantMessage;
    } catch (err: any) {
      console.error("Chat AI API failed:", err);
      const assistantMsgId = "msg_ai_" + Math.random().toString(36).substring(2, 11);
      const fallbackMsg: Message = {
        messageId: assistantMsgId,
        userId: currentUser?.uid || "guest_user",
        role: "assistant",
        text: `I am currently experiencing higher demand or connection spikes. Let me record and backup your query locally: "${trimmed}"`,
        mapAction: { type: "none" },
        createdAt: new Date(),
      };

      if (currentUser) {
        try {
          await setDoc(doc(db, `chats/${targetChatId}/messages`, assistantMsgId), {
            ...fallbackMsg,
            createdAt: serverTimestamp(),
          });
        } catch {}
      } else {
        const chatMsgs = localMessages[targetChatId] || [];
        const withAI = [...chatMsgs, userMessage, fallbackMsg];
        saveToLocalStorage(localChats, { ...localMessages, [targetChatId]: withAI });
      }

      setLoading(false);

      if (onBotReply) {
        onBotReply(fallbackMsg.text, assistantMsgId);
      }

      return fallbackMsg;
    }
  };

  return {
    chats,
    activeChatId,
    setActiveChatId,
    messages,
    allMessages,
    searchQuery,
    setSearchQuery,
    loading,
    setLoading,
    inputText,
    setInputText,
    createNewSession,
    deleteSession,
    sendMessageToBot,
    migrateLocalDataToCloud,
    devScrollRef,
    scrollToBottom,
  };
};
