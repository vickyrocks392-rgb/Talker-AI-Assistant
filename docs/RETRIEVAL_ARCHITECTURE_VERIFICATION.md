# Retrieval Architecture Verification

## 1. Retrieval Flow Diagram

```
Chat Request (POST /api/chat)
  → server/routes/chat.ts: handleChat()
    → server/ai/conversation/conversationService.ts: handleNonStreaming() / handleStreaming()
      → resolveAttachments()
          Resolves document IDs from:
            (a) request.attachments (if provided)
            (b) conversation.activeDocuments (fallback)
            (c) undefined (no documents)
      → orchestrate() → ExecutionPlan
      → contextBuilder.build() or contextBuilder.buildWithAttachments()
        ── buildWithAttachments() path (has attachments) ──
          → retrieveRagContextForAttachments(text, documentIds)
            → ragService.retrieveContextForDocuments(text, documentIds)
              → retriever.retrieve(query, documentIds)
                → vectorStore.similaritySearch(query, k, filter)
                  → ChromaDB similaritySearchWithScore(query, k, filter)
                    WHERE documentId IN documentIds  ✓

        ── build() path (no attachments) ──
          → retrieveRagContext(text)
            → ragService.retrieveContext(text)  ← **VIOLATION: global search**
              → retriever.retrieve(query)       ← **no documentIds**
                → vectorStore.similaritySearch(query, k)  ← **no filter**
                  → ChromaDB similaritySearchWithScore(query, k)  ← **GLOBAL SEARCH**
```

## 2. Files Responsible

| Responsibility | File |
|---|---|
| Knowledge Center storage | `server/routes/rag.ts` (SQLite `documents` table) |
| Active document state | `server/memory/repository.ts` (SQLite `conversations.active_documents`) |
| Retrieval entry point | `server/ai/conversation/conversationService.ts` → `resolveAttachments()` |
| Context builder (RAG integration) | `server/ai/context/builder.ts` |
| RAG service (orchestration) | `server/ai/rag/service.ts` |
| Retriever (embed + search) | `server/ai/rag/retriever.ts` |
| Chroma query execution | `server/ai/rag/vectorstore.ts` |

## 3. Architecture Violations Discovered

### VIOLATION 1 — Global retrieval in `contextBuilder.build()`

**File**: `server/ai/context/builder.ts`, lines 100-104

```ts
const ragResult = shouldUseRag
  ? await this.retrieveRagContext(text)   // ← global, no document IDs
  : null;
```

`retrieveRagContext()` calls `ragService.retrieveContext(text)` which performs an **unfiltered global Chroma query**. This means every chat request without attachments retrieves chunks from ALL documents in the Knowledge Center.

**Violates**: Invariant 1 (Knowledge Center documents must never participate in chat retrieval unless attached as active documents)

### VIOLATION 2 — Empty-document fallback to global search

**File**: `server/ai/rag/service.ts`, lines 224-226

```ts
if (documentIds.length === 0) {
  return this.retrieveContext(query);  // ← falls through to global search
}
```

When `documentIds.length === 0`, instead of returning null, it falls through to `retrieveContext()` which performs a global unfiltered search.

**Violates**: Invariant 2 (if activeDocuments.length == 0, chat retrieval must terminate immediately)

### VIOLATION 3 — No guard for `activeDocuments.length >= 2` before multi-document retrieval

**File**: `server/ai/rag/service.ts`, lines 208-221

The compare guard only checks `documentIds.length < 2` for compare requests. For non-compare requests with 0 or 1 documents, there is no guard preventing retrieval from proceeding with insufficient documents.

**Violates**: Invariant 3 (if activeDocuments.length == 1, only that document may participate) — the single-document path is correct, but the empty path is not.

### VIOLATION 4 — `ragService.retrieveContext()` is still callable

**File**: `server/ai/rag/service.ts`, lines 135-178

The `retrieveContext()` method performs global unfiltered retrieval. It is called from `contextBuilder.retrieveRagContext()` which is called from `contextBuilder.build()`.

**Violates**: Invariant 1 (global retrieval leaks Knowledge Center documents into chat)

## 4. Minimal Patch Set

### Patch 1: `server/ai/rag/service.ts`

- **Guard empty documentIds**: When `documentIds.length === 0`, return null immediately instead of falling through to global retrieval.
- **Add structured logging** as specified in Task 7.

### Patch 2: `server/ai/context/builder.ts`

- **Remove global RAG retrieval from `build()`**: When there are no attachments, RAG should not be performed. The `buildWithAttachments()` method is the only path that should do RAG retrieval.
- The `retrieveRagContext()` private method can be removed entirely since it's only called from `build()`.

### Patch 3: `server/ai/rag/service.ts`

- **Add structured [Retrieval] logging** at the entry point of `retrieveContextForDocuments()`.