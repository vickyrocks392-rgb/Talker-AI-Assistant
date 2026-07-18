# Data Flow Diagrams

Mermaid diagrams for the key data flows in **Noryx**. These complement the prose in [../AI/AI_ARCHITECTURE.md](../AI/AI_ARCHITECTURE.md) and [../Architecture/SYSTEM_ARCHITECTURE.md](../Architecture/SYSTEM_ARCHITECTURE.md).

---

## 1. User → AI (chat turn)

```mermaid
flowchart TB
    U[User] -->|POST /api/chat| R[Chat Route]
    R -->|sanitize + filter| S[Security]
    R --> CS[ConversationService]
    CS --> O[Orchestrator → ExecutionPlan]
    CS --> CB[ContextBuilder]
    CB -->|history| M[MemoryService]
    CB -->|global memory| MR[Memory Retrieval]
    CB -->|tool result| T[Tool Engine]
    CS --> P[AI Provider + Failover]
    P -->|LLM| Ext[Ollama/Groq/Gemini]
    CS -->|persist| M
    CS --> Mon[AI Monitor]
    Mon --> R
    R -->|output filter| R
    R -->|reply + aiMonitor| U
```

---

## 2. User → RAG (attachment-scoped retrieval)

```mermaid
flowchart TB
    U[User + attached docs] -->|POST /api/chat| CS[ConversationService]
    CS --> CB[ContextBuilder.buildWithAttachments]
    CB -->|documentIds| RS[RagService.retrieveContextForDocuments]
    RS -->|compare guard| G{<2 docs?}
    G -->|yes| Instr[Return attach-another-doc instruction]
    G -->|no| Ret[RagRetriever.retrieve]
    Ret --> Emb[Embed query]
    Emb --> VS[Chroma filter documentId=$eq]
    VS --> Fmt[Format context]
    Fmt --> CB
```

---

## 3. User → Memory (global memory)

```mermaid
flowchart LR
    U[User query] --> MR[retrieveMemory]
    MR -->|search| GM[(global_memory table)]
    MR -->|confidence >= 0.4| Fmt[Format Q/A context]
    Fmt --> CB[ContextBuilder]
    CB --> P[Provider]
    P -->|reply| SM[saveGlobalMemory]
    SM -->|qualifier filter| GM
```

---

## 4. Document Upload (ingestion)

```mermaid
flowchart TB
    U[Upload file] -->|multipart| R[Rag Route]
    R --> FV[FileValidationService]
    FV -->|reject| X[400 FILE_REJECTED]
    FV --> PID[PromptInjectionDetector scan]
    PID --> Ext[Extract text: PdfLoader / text]
    Ext --> Split[RagSplitter]
    Split --> Emb[RagEmbeddings]
    Emb --> VS[Chroma vector store]
    VS --> Doc[(documents table)]
    Doc --> KC[Knowledge Center]
```

---

## 5. Streaming

```mermaid
sequenceDiagram
    participant U as User
    participant R as Route
    participant CS as ConversationService
    participant P as Provider
    U->>R: POST /api/chat { stream:true }
    R-->>U: text/event-stream
    CS->>P: chatStream(messages)
    loop tokens
        P-->>CS: chunk
        CS-->>R: data: { token }
        R-->>U: token
    end
    P-->>CS: done
    CS-->>R: data: { done, replyText, aiMonitor, security }
    R-->>U: final event
```

---

## 6. Voice

```mermaid
flowchart LR
    Sp[Speech] --> SR[Web Speech Recognition]
    SR -->|transcript| U[sendMessageToBot isVoice=true]
    U -->|POST /api/chat| BE[Backend]
    BE -->|isVoice hint (request-scoped)| Ctx[ContextBuilder]
    Ctx --> P[Provider]
    P -->|replyText| BE
    BE -->|stream| U
    U -->|SpeechSynthesis| Out[Audio playback]
```

---

## 7. Knowledge Retrieval (search endpoint)

```mermaid
flowchart TB
    U[Search query] -->|POST /api/rag/search| R[Rag Route]
    R --> PID[PromptInjectionDetector scan]
    PID --> Emb[Embed query]
    Emb --> VS[Chroma similaritySearch]
    VS --> Res[results + score]
    Res --> R
    R -->|results + security| U
```

---

## 8. Security Pipeline

```mermaid
flowchart TB
    Req[Request] --> RL[Rate Limiter]
    RL -->|429| Rej[Reject]
    RL --> IN[InputSecurityService.sanitize]
    IN -->|block| Rej
    IN --> CF1[ContentFilterService input]
    CF1 -->|block| Rej
    CF1 --> Biz[Business logic]
    Biz --> CF2[ContentFilterService output]
    CF2 --> Tel[SecurityTelemetry]
    Tel --> Resp[Response + security]