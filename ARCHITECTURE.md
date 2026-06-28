# Architecture Guide — Talker AI Backend

## Overview

The backend follows clean architecture principles with clear separation of concerns. Each module in server/ has a single responsibility, and the dependency direction flows: routes → ai/utils → config/middleware.

## Directory Layout

```
server/
├── config/          — Centralised typed config (env.ts, version.ts)
├── ai/              — LLM logic (types, config, prompts, parser, ollama, summarize)
├── routes/          — Express handlers (chat, summarize, tts, health)
├── middleware/      — Global error handler + API 404 handler
└── utils/           — Logger, errors, retry, validation

shared/
└── types.ts         — API contracts + domain models (shared by frontend & backend)
```

## Module Responsibilities

### config/env.ts
Validates environment variables at startup and exposes a typed AppConfig object. No scattered process.env calls.

### config/version.ts
Exports APP_NAME and APP_VERSION from package.json.

### ai/config.ts
Model registry (MODELS map) listing every supported Ollama model. getActiveModel() resolves the model name from the environment and validates it against the registry.

### ai/types.ts
Re-exports shared types from shared/types.ts. Also declares server-only types: OllamaMessage, OllamaChatRequest, OllamaResponse, AIProvider, ModelConfig, ModelResponseParsed.

### ai/prompts.ts
System prompts crafted for consistent JSON output: createChatSystemPrompt() and createSummarizeSystemPrompt().

### ai/parser.ts
Robust JSON extraction handling markdown fences, extra whitespace, and malformed output. Never crashes.

### ai/ollama.ts
OllamaProvider implementing AIProvider via Ollama's /api/chat endpoint. Singleton via getOllamaProvider().

### routes/chat.ts — POST /api/chat
Accepts { text, history, persona, stream? }. Validated by validateChatRequest(). Supports SSE streaming.

### routes/summarize.ts — POST /api/summarize
Generates conversation titles. Falls back to "Personal Companion Chat".

### routes/tts.ts — POST /api/tts
Returns browser-native TTS fallback response.

### routes/health.ts
GET /health (liveness), GET /ready (readiness with Ollama probe), GET /version (build metadata).

### middleware/error.ts
apiNotFoundHandler for unknown /api/* routes. globalErrorHandler catches AppError subclasses, wraps unknowns in 500.

### utils/validation.ts
Typed request validators (validateChatRequest, validateSummaryRequest, validateTtsRequest) throwing ValidationError.

### utils/errors.ts
Error hierarchy: AppError → ValidationError, OllamaError, ParseError, ConfigError, RetryExhaustedError.

### utils/retry.ts
withRetry() with exponential backoff for connection-level errors.

### utils/logger.ts
Structured logger with DEBUG (dev-only), INFO, WARN, ERROR levels.

## Shared Types (shared/types.ts)

Defines: Persona, ConversationMessage, MapAction, MapDirections, TravelMode, MapActionType, ChatRequest, ChatResponse, SummaryRequest, SummaryResponse. Both server/ai/types.ts and src/types.ts re-export these.

## Request Flow

```
Client → POST /api/chat → express.json() → validateChatRequest()
                                           → createChatSystemPrompt()
                                           → OllamaProvider.chat()
                                           → parseChatResponse()
                                           → res.json({ replyText, mapAction })
```

If validation fails → ValidationError → global handler → 400 JSON.
If Ollama fails → 200 with fallback text (graceful degradation).

## Extending

### New model
1. ollama pull <model>
2. Add entry to MODELS in server/ai/config.ts
3. Set OLLAMA_MODEL in .env

### New provider (OpenAI, Gemini, ...)
1. Implement AIProvider in server/ai/
2. Update provider dispatch in config
3. No route changes needed

