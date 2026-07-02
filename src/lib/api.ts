/**
 * API client for Talker AI backend.
 *
 * Centralises all fetch calls so the rest of the frontend never
 * duplicates URL construction, header logic, or error handling.
 */

import type { Persona } from "../types";

// ── Response types (mirror backend contracts) ────────────────────────

export interface ConversationDTO {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ConversationDetailDTO {
  conversation: ConversationDTO;
  messages: MessageDTO[];
}

export interface ChatResponseDTO {
  replyText: string;
  mapAction: { type: "none" | "search" | "directions"; query?: string; directions?: unknown };
  searchSources?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const customKey = localStorage.getItem("custom_ollama_api_key") || "";
  return customKey ? { "x-ollama-key": customKey } : {};
}

async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${body || response.statusText}`);
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

// ── Conversations API ────────────────────────────────────────────────

/** GET /api/conversations — list all conversations. */
export function fetchConversations(): Promise<ConversationDTO[]> {
  return request<ConversationDTO[]>("/api/conversations");
}

/** POST /api/conversations — create a new conversation. */
export function createConversation(
  title?: string,
): Promise<ConversationDTO> {
  return request<ConversationDTO>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

/** GET /api/conversations/:id — fetch conversation with messages. */
export function getConversation(
  id: string,
): Promise<ConversationDetailDTO> {
  return request<ConversationDetailDTO>(`/api/conversations/${id}`);
}

/** DELETE /api/conversations/:id — delete a conversation. */
export function deleteConversation(id: string): Promise<void> {
  return request<void>(`/api/conversations/${id}`, { method: "DELETE" });
}

// ── Chat API ─────────────────────────────────────────────────────────

export interface ChatRequestParams {
  text: string;
  conversationId: string;
  persona: Persona;
  stream?: boolean;
}

/** POST /api/chat — send a message (non-streaming). */
export function sendChatMessage(
  params: ChatRequestParams,
): Promise<ChatResponseDTO> {
  return request<ChatResponseDTO>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      text: params.text,
      conversationId: params.conversationId,
      persona: params.persona,
      stream: params.stream ?? false,
    }),
  });
}

/**
 * POST /api/chat — send a message and consume a Server-Sent Events stream.
 *
 * Calls `onToken` for each text delta and resolves with the final
 * ChatResponseDTO when the stream completes.
 */
export function sendChatMessageStream(
  params: ChatRequestParams,
  onToken: (token: string) => void,
): Promise<ChatResponseDTO> {
  return new Promise<ChatResponseDTO>((resolve, reject) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    };

    fetch("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: params.text,
        conversationId: params.conversationId,
        persona: params.persona,
        stream: true,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`API ${response.status}: ${body || response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Stream not supported");

        const decoder = new TextDecoder();
        let buffer = "";
        let finalResponse: ChatResponseDTO | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = JSON.parse(line.slice(6));

            if (data.token) {
              onToken(data.token);
            } else if (data.done) {
              finalResponse = {
                replyText: data.replyText,
                mapAction: data.mapAction,
                searchSources: data.searchSources,
              };
            } else if (data.error) {
              reject(new Error(data.error));
              return;
            }
          }
        }

        if (finalResponse) {
          resolve(finalResponse);
        } else {
          reject(new Error("Stream ended without final response"));
        }
      })
      .catch(reject);
  });
}