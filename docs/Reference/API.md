# API Reference

Every public endpoint of the Noryx backend. All paths are relative to the server origin. JSON bodies use `Content-Type: application/json` unless noted.

- Backend: [../Backend/BACKEND.md](../Backend/BACKEND.md)
- Security: [../Security/SECURITY.md](../Security/SECURITY.md)
- Data flow: [../DataFlow/DATA_FLOW.md](../DataFlow/DATA_FLOW.md)

---

## 1. Chat

### `POST /api/chat`

Send a message and receive a reply. Supports non-streaming JSON and Server-Sent Events streaming.

**Request body:**
```json
{
  "text": "string (required)",
  "conversationId": "string (optional)",
  "history": "ConversationMessage[] (optional, legacy)",
  "persona": "Persona (optional)",
  "stream": "boolean (optional, default false)",
  "attachments": "ChatAttachment[] (optional)",
  "isVoice": "boolean (optional, default false)"
}
```

**Non-streaming response (200):**
```json
{
  "replyText": "string",
  "mapAction": { "type": "none" | "search" | "directions", "query?": "string" },
  "searchSources": "string[]",
  "aiMonitor": "AIMonitorDTO",
  "security": "SecurityTelemetryDTO"
}
```

**Streaming behaviour:** when `stream: true`, the response is `text/event-stream`. Each line is `data: { ... }`:
- `{ "token": "..." }` — incremental text delta.
- `{ "done": true, "replyText": "...", "aiMonitor": {...}, "security": {...} }` — final payload.
- `{ "error": "..." }` — stream error.

**Possible errors:**
- `400 INPUT_REJECTED` — input rejected by sanitiser.
- `400 CONTENT_BLOCKED` — input blocked by content filter.
- `400` (validation) — malformed body.
- `429 RATE_LIMITED` — too many requests.
- `200` with fallback text — provider/parse failure (graceful degradation).

---

## 2. Conversations

### `GET /api/conversations`
List all conversations (most recently updated first).
**Response (200):** `Conversation[]`.

### `POST /api/conversations`
Create a conversation.
**Request:** `{ "title?": "string" }`.
**Response (201):** `Conversation`.

### `GET /api/conversations/:id`
Get a conversation with its messages.
**Response (200):** `{ conversation: Conversation, messages: Message[] }`.
**Errors:** `404` if not found.

### `PATCH /api/conversations/:id`
Rename a conversation (sets `titleGenerated = 0`).
**Request:** `{ "title": "string" }`.
**Response (200):** `Conversation`.
**Errors:** `400` empty title, `404` not found.

### `DELETE /api/conversations/:id`
Delete a conversation and its messages.
**Response (204):** no content.
**Errors:** `404` not found.

---

## 3. RAG / Knowledge Center

### `POST /api/rag/upload`
Upload and index a document (multipart `file`). Validated + injection-scanned.
**Response (201):** `{ documentId, filename, pageCount, textLength, chunkCount, status, security }`.
**Errors:** `400 FILE_REJECTED`, `400` unsupported type, `400` oversized.

### `POST /api/rag/search`
Semantic search over indexed documents. Query is injection-scanned.
**Request:** `{ "query": "string", "k?": "number" }`.
**Response (200):** `{ results: [{ content, score, metadata }], security }`.

### `GET /api/rag/documents`
List all indexed documents.
**Response (200):** `{ documents: RagDocument[] }`.

### `GET /api/rag/documents/active`
Get the currently active document.
**Response (200):** `{ document: RagDocument | null }`.

### `POST /api/rag/documents/active`
Set the active document.
**Request:** `{ "documentId": "string" }`.
**Response (200):** `{ success, documentId }`.

### `GET /api/rag/documents/:id`
Get document metadata.
**Response (200):** `{ document: RagDocument }`. **Errors:** `404`.

### `GET /api/rag/documents/:id/text`
Get the extracted full text of a document (reconstructed from chunks).
**Response (200):** `{ documentId, text, chunkCount }`.

### `DELETE /api/rag/documents/:id`
Delete a document, its ChromaDB vectors, and conversation active-doc references atomically.
**Response (200):** `{ success, documentId }`. **Errors:** `404`.

### `POST /api/rag/documents/:id/reindex`
Reindex a document.
**Response (200):** `{ success, documentId, status }`. **Errors:** `404`.

### `GET /api/rag/stats`
Document and chunk statistics + vector DB status.
**Response (200):** `{ totalDocuments, totalChunks, indexedDocuments, vectorDbStatus, vectorCount, activeDocument }`.

### `POST /api/rag/summarize/:id`
Generate an AI summary (summary, keyPoints, entities, technologies, skills) for a document.
**Response (200):** `{ documentId, filename, summary, keyPoints, entities, technologies, skills, pageCount, chunkCount }`. **Errors:** `404`.

### `POST /api/rag/reset`
Reset the RAG collection (dev only). Deletes all Chroma vectors + document rows.
**Response (200):** `{ success, message }`.

---

## 4. Health & System

### `GET /health`
Liveness probe. **Response (200):** `{ status, model, timestamp }`.

### `GET /ready`
Readiness probe. **Response (200):** `{ status, uptime }` or **503** if provider unreachable.

### `GET /version`
Build metadata. **Response (200):** `{ name, version, node, model, uptime }`.

### `GET /api/health`
Comprehensive health check (backend, ollama, chromadb, sqlite, ragReady).
**Response (200):** health report object.

### `GET /api/system/health`
System Control Center tri-state report (backend, providers, database, chromadb, embeddings, memory, rag, models).
**Response (200):** `SystemHealthDTO`. See [../Frontend/FRONTEND.md](../Frontend/FRONTEND.md).

---

## 5. Summarize & TTS

### `POST /api/summarize`
Generate a conversation title from messages.
**Request:** `{ "messages": "ConversationMessage[]" }`.
**Response (200):** `{ summary: "string" }` (falls back to "Personal Companion Chat" on model error).

### `POST /api/tts`
Text-to-speech fallback marker (Ollama is text-only).
**Request:** `{ "text": "string" }`.
**Response (200):** `{ error: "NOT_SUPPORTED", fallback: true, message: "..." }`.

---

## 6. Error shape

All errors use a consistent shape:
```json
{ "error": { "code": "STRING_CODE", "message": "string" } }
```
Plus an optional `security` telemetry object on chat/rag endpoints. Unknown `/api/*` paths return `404 NOT_FOUND`.