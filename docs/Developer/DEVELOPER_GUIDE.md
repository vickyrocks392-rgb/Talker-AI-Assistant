# Developer Guide

How to install, run, configure, debug, and extend **Noryx**.

- Architecture: [../Architecture/SYSTEM_ARCHITECTURE.md](../Architecture/SYSTEM_ARCHITECTURE.md)
- API: [../Reference/API.md](../Reference/API.md)
- Backend: [../Backend/BACKEND.md](../Backend/BACKEND.md)

---

## 1. Prerequisites

- **Node.js** 18+ (TypeScript project, ESM).
- **Ollama** running locally (default `http://127.0.0.1:11434`) with a model pulled (e.g. `ollama pull llama3.2:3b`).
- **ChromaDB** running (default `http://localhost:8000`) for RAG. Optional — the server boots without it (RAG degrades gracefully).
- **Groq / Gemini API keys** only if you enable those providers via failover.

---

## 2. Install

```bash
npm install
```

This installs frontend (React/Vite) and backend (Express, better-sqlite3, chromadb, langchain) dependencies.

---

## 3. Run

```bash
# Development (tsx + Vite middleware on same port)
npm run dev

# Production build + start
npm run build
npm start
```

- Dev server: `http://localhost:3000` (Vite serves the UI, proxies API to Express).
- `npm run dev:3001` runs on port 3001 with a custom HMR port.

Other scripts:
- `npm run lint` — `tsc --noEmit` type check.
- `npm run migrate` — run SQLite migrations.
- `npm run migrate:status` / `npm run migrate:reset`.

---

## 4. Environment variables

All config is loaded by `server/config/env.ts`. Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server port. |
| `NODE_ENV` | `development` | `production` disables dev middleware. |
| `AI_PROVIDER` | `ollama` | `ollama` or `groq`. |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama base URL. |
| `OLLAMA_MODEL` | `llama3.2:3b` | Active Ollama model. |
| `GROQ_API_KEY` | — | Required if Groq active. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model. |
| `GEMINI_API_KEY` | — | Used by failover. |
| `GEMINI_MODEL` | `gemini-2.0-flash-exp` | Gemini model. |
| `AI_FAILOVER_ENABLED` | `true` | Enable multi-provider failover. |
| `AI_PROVIDER_PRIORITY` | `groq,gemini,ollama` | Failover order. |
| `CHROMA_HOST` / `CHROMA_PORT` | `localhost` / `8000` | ChromaDB connection. |
| `RAG_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model. |
| `RAG_MAX_UPLOAD_SIZE_MB` | `10` | Max upload size. |
| `SEC_JSON_BODY_LIMIT` | `10mb` | Request body limit. |
| `SEC_REQUEST_TIMEOUT_MS` | `120000` | Request timeout. |
| `SEC_RATE_LIMIT_MAX` / `SEC_RATE_LIMIT_WINDOW_MS` | `100` / `60000` | Rate limiting. |
| `SEC_MAX_INPUT_LENGTH` | `20000` | Max input chars. |
| `HMR_PORT` / `DISABLE_HMR` | — | Vite HMR tuning. |

Create a `.env` file in the project root (dotenv loads it automatically).

---

## 5. Development workflow

1. Start Ollama + ChromaDB.
2. `npm run dev`.
3. Edit frontend in `src/` (Vite HMR) and backend in `server/` (tsx restarts via your process manager or `tsx` watch).
4. Type-check continuously with `npm run lint` in another terminal.
5. Use the Workspace Intelligence sidebar to watch health/AI Monitor live.

---

## 6. Debugging

- **Logs:** structured logger (`server/utils/logger.ts`). DEBUG logs only in development.
- **Startup checks:** `server.ts` prints dependency status (SQLite, Ollama, ChromaDB, RAG collection). A ✗ means that dependency is down but the server still boots (best-effort).
- **Secret audit:** missing required secrets print a warning at startup.
- **RAG issues:** `GET /api/rag/stats` shows `vectorDbStatus` and `vectorCount`. `POST /api/rag/reset` clears the collection (dev only).
- **Streaming:** open DevTools → Network, filter `text/event-stream` on `/api/chat` to see `token` / `done` events.
- **Type errors:** `npx tsc --noEmit` (or `npm run lint`).

---

## 7. Adding a provider

1. Implement `AIProvider` (`server/ai/types.ts`) in a new file, e.g. `server/ai/myprovider.ts`.
2. Add a branch in `server/ai/provider.ts` (single-provider mode) and register it in `server/ai/failover.ts` (failover mode).
3. Add config fields to `server/config/env.ts` (`AppConfig`) and `.env`.
4. Update `AI_PROVIDER_PRIORITY` if using failover.

No route changes are needed — `getAIProvider()` is the single entry point.

---

## 8. Adding a tool

1. Create `server/ai/tools/mytool.ts` implementing the `Tool` interface (`server/ai/tools/types.ts`).
2. Add a branch in `server/ai/tools/planner.ts` (`plan()`) that returns a `ToolRequest` when the input matches.
3. Register the tool in `server.ts`: `registry.register(new MyTool())`.

The planner is deterministic (regex/pattern matching) — no LLM call. The Orchestrator's `PolicyEngine` may also set `useTools` for relevant intents.

---

## 9. Adding memory

- **Conversation memory:** handled by `MemoryService` + repository; no change needed for standard history.
- **Global memory:** extend `server/memory/qualifier.ts` to control which Q&A pairs are persisted, and `server/memory/retrieval.ts` for retrieval scoring/formatting.
- New memory *types* (e.g. structured facts) would extend the `global_memory` table via a new migration in `server/db/migrations/` and the repository.

---

## 10. Adding RAG features

- **Splitter:** tune `server/ai/rag/splitter.ts` (chunk size/overlap).
- **Retriever strategy:** extend `server/ai/rag/retriever.ts` (e.g. MMR, hybrid search) behind the `Retriever` interface.
- **Vector store:** swap `server/ai/rag/vectorstore.ts` behind the `VectorStore` interface (Chroma today; Pinecone/Qdrant later).
- **Embeddings:** change the model in `server/ai/rag/embeddings.ts` (keep `dimensions` in sync with the vector store).
- **Ingestion:** extend `server/routes/rag.ts` upload handler (e.g. new file types via `loader.ts` / `pdfLoader.ts`).

Remember: retrieval must stay **attachment-scoped** — never perform global document search in the chat path (see [../DataFlow/DATA_FLOW.md](../DataFlow/DATA_FLOW.md) and [../AI/AI_ARCHITECTURE.md](../AI/AI_ARCHITECTURE.md)).