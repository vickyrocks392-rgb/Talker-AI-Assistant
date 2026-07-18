# Retrieval Architecture Verification

> **Status: VERIFIED — attachment-scoped RAG invariants are satisfied.**
>
> This document records the verification of the Knowledge Center retrieval invariants. It supersedes the earlier "violations" draft; the issues described there were resolved by routing all chat retrieval through `buildWithAttachments` + `retrieveContextForDocuments` with empty-document guards.

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
      → contextBuilder.build() OR contextBuilder.buildWithAttachments()

        ── buildWithAttachments() path (has attachments) ──
          → retrieveRagContextForAttachments(text, documentIds)
            → ragService.retrieveContextForDocuments(text, documentIds)
              → retriever.retrieve(query, documentIds)
                → vectorStore.similaritySearch(query, k, filter)
                  WHERE documentId IN documentIds  ✓ (scoped)

        ── build() path (no attachments) ──
          → RAG result is explicitly null  ✓ (no global search)
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

## 3. Invariants (all satisfied)

### Invariant 1 — Knowledge Center documents never participate in chat retrieval unless attached
`contextBuilder.build()` (no attachments) sets `ragResult = null`. Only `buildWithAttachments()` performs retrieval, and only for the supplied `documentIds`.

### Invariant 2 — Empty active documents terminate retrieval immediately
`ragService.retrieveContextForDocuments()` returns `null` when `documentIds.length === 0`. No Chroma query is issued.

### Invariant 3 — Single-document retrieval is scoped
When exactly one document is attached, retrieval filters `documentId = $eq <id>`. Multi-document requests run independent per-document queries and dedupe by `documentId:chunkIndex`.

### Invariant 4 — Compare requests with <2 documents are blocked from unscoped search
The compare guard returns an instruction to attach another document instead of performing a global search.

## 4. Verification Method

- Static review of `server/ai/context/builder.ts` (`build` vs `buildWithAttachments`).
- Static review of `server/ai/rag/service.ts` (`retrieveContextForDocuments` guards).
- Confirmed `ragService.retrieveContext` (global, unfiltered) is **not** called from the chat path.

See also: [AI/AI_ARCHITECTURE.md](AI/AI_ARCHITECTURE.md) (RAG section) and [DataFlow/DATA_FLOW.md](DataFlow/DATA_FLOW.md) (User → RAG diagram).