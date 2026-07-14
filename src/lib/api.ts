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
  titleGenerated?: number;
}

export interface ChatAttachment {
  documentId: string;
  filename: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Optional file attachments associated with this message */
  attachments?: ChatAttachment[];
}

export interface ConversationDetailDTO {
  conversation: ConversationDTO;
  messages: MessageDTO[];
}

export interface AIMonitorDTO {
  provider: string;
  model: string;
  latencyMs: number;
  mode: string;
  memory?: { entryCount: number; avgConfidence: number };
  rag?: { activeDocCount: number; chunkCount: number };
  tools?: { executionCount: number; toolNames: string[] };
}

export interface ChatResponseDTO {
  replyText: string;
  mapAction: { type: "none" | "search" | "directions"; query?: string; directions?: unknown };
  searchSources?: string[];
  aiMonitor?: AIMonitorDTO;
}

// ── System Health (System Control Center) ──────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unavailable";

export interface ComponentHealthDTO {
  status: HealthStatus;
  detail?: string;
}

export interface ProviderHealthDTO {
  status: HealthStatus;
  configured: boolean;
  detail?: string;
}

export interface ModelVisibilityDTO {
  provider: string;
  model: string;
  embeddingModel: string;
}

export interface SystemHealthDTO {
  backend: ComponentHealthDTO;
  providers: {
    groq: ProviderHealthDTO;
    gemini: ProviderHealthDTO;
    ollama: ProviderHealthDTO;
  };
  database: ComponentHealthDTO;
  chromadb: ComponentHealthDTO;
  embeddings: ComponentHealthDTO;
  memory: ComponentHealthDTO;
  rag: ComponentHealthDTO;
  models: ModelVisibilityDTO;
  timestamp: string;
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
  attachments?: ChatAttachment[];
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
      attachments: params.attachments ?? [],
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
        attachments: params.attachments ?? [],
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
              console.log("[AI Monitor DEBUG] SSE done event data:", JSON.stringify(data));
              finalResponse = {
                replyText: data.replyText,
                mapAction: data.mapAction,
                searchSources: data.searchSources,
                aiMonitor: data.aiMonitor,
              };
              console.log("[AI Monitor DEBUG] finalResponse.aiMonitor:", finalResponse.aiMonitor);
            } else if (data.error) {
              reject(new Error(data.error));
              return;
            } else if (!data.token && !data.done && !data.error) {
              console.log("[AI Monitor DEBUG] Unhandled SSE event:", JSON.stringify(data));
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

// ── System Health API ────────────────────────────────────────────────

/** GET /api/system/health — System Control Center health report. */
export function fetchSystemHealth(): Promise<SystemHealthDTO> {
  return request<SystemHealthDTO>("/api/system/health");
}
