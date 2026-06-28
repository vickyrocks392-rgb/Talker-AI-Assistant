# Changelog

## [1.1.0] — Phase 1: Production Infrastructure

This phase transformed the project into a production-ready engineering foundation without changing user-facing functionality. Focused on architecture, maintainability, documentation, configuration, validation, and developer experience.

### Added
- **Shared types module** (`shared/types.ts`) — single source of truth for API contracts and domain models (Persona, MapAction, ConversationMessage, ChatRequest/Response, SummaryRequest/Response).
- **Centralised configuration** (`server/config/env.ts`) — typed `AppConfig` loaded and validated at startup. No scattered `process.env` calls.
- **Version module** (`server/config/version.ts`) — name and version from `package.json`.
- **Request validation** (`server/utils/validation.ts`) — typed validators for chat, summarize, and TTS routes. Throws `ValidationError` (400) on malformed input.
- **Global error handling** (`server/middleware/error.ts`) — consistent JSON error responses, `AppError` hierarchy, API 404 handler.
- **Health endpoints** (`server/routes/health.ts`) — `GET /health`, `GET /ready`, `GET /version` with Ollama connectivity probe.
- **Production docs** — comprehensive README, updated ARCHITECTURE, PROJECT_AUDIT.md.

### Changed
- **Config refactored**: `server/ai/config.ts` now delegates to centralised config and throws `ConfigError` for unknown models. Removed dead exports (`printConfig`, `listAvailableModels`).
- **Types harmonized**: `server/ai/types.ts` re-exports shared types; `src/types.ts` imports from shared, removes duplicated `MapAction`/`Persona`/`ConversationMessage` definitions.
- **Logger improved**: uses `getConfig().server.isDevelopment`, typed `data?: unknown` instead of `data?: any`.
- **Error class hierarchy**: added `AppError` base class with `statusCode` and `code`. `ValidationError`, `OllamaError`, `ParseError`, `ConfigError`, `RetryExhaustedError` all extend `AppError`.
- **Routes use validation**: chat, summarize, and TTS routes now delegate to `validate*Request()` instead of inline checks.
- **Server entry cleaned**: uses `getConfig()` for all environment reads; health router replaces inline `/health` handler; global error middleware wired in.
- **`OllamaStreamChunk`** fixed from empty interface `extends OllamaResponse {}` to type alias `OllamaResponse`.
- **Any typed removed**: server-side `error: any`, `data?: any`, `(error as any)` replaced with `unknown`, proper narrowing, and intersection types.

### Removed
- **Legacy files**: `server.ts.backup`, `REFACTORING_COMPLETE.md`, `CHANGELOG_REFACTOR.md`, `SERVER_README.md`, `SERVER_REFERENCE.md`, `security_spec.md`.
- **Dead exports**: `printConfig`, `listAvailableModels`, `isValidJsonStart`, `isValidJson`, `withoutRetry`.
- **Stale `.env.example`**: replaced with accurate env vars (PORT, NODE_ENV, OLLAMA_URL, OLLAMA_MODEL, HMR_PORT, DISABLE_HMR).

### Validation
- `npm run lint` passes with zero errors.
- `npm run build` produces valid production bundle.
- No changes to API contracts, streaming, or frontend behavior.

## [1.0.0] — Talker AI v3: OpenStreetMap + Leaflet Production Refactor

...

