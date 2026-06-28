# Project Audit — Talker AI

## Executive Summary

This audit was conducted as the first deliverable of Phase 1 (Production Infrastructure Refactor). The project was evaluated for dead code, unused files, duplicate logic, inconsistent naming, stale documentation, unnecessary dependencies, and architectural debt.

**Overall health**: Good. The backend was already modularised before Phase 1. The main issues were scattered `process.env` usage, duplicated type definitions between frontend and backend, ad-hoc validation, missing global error handling, and several stale documentation files.

**Remediation performed**: Centralised config, shared types, typed validation, global error handler, health endpoints, structured logging improvements, removed 6 legacy files and 5 dead code exports, rewrote documentation.

## Folder Review

| Folder | Responsibility | Assessment |
|--------|---------------|------------|
| server/ai/ | AI/LLM logic | Clean. Single responsibility per file. |
| server/routes/ | Express route handlers | Improved with validation and health routes. |
| server/utils/ | Shared utilities | Expanded with validation.ts. |
| server/config/ | Centralised configuration | New — created in Phase 1. |
| server/middleware/ | Express middleware | New — created in Phase 1. |
| shared/ | Shared types (FE + BE) | New — created in Phase 1. |
| src/ | React frontend | Clean. Maps module is well-structured. |

## Technical Debt — Resolved

| Issue | Severity | Resolution |
|-------|----------|------------|
| Scattered process.env reads | High | Centralised in server/config/env.ts with validation |
| Duplicated types (MapAction, Persona, etc.) | High | Extracted to shared/types.ts |
| Ad-hoc validation in route handlers | Medium | Extracted to server/utils/validation.ts |
| Missing global error handler | High | Added server/middleware/error.ts |
| Inline /health, no /ready or /version | Medium | Extracted to server/routes/health.ts |
| Logger used any for data/error params | Medium | Changed to unknown with narrowing |
| OllamaStreamChunk empty interface | Low | Changed to type alias |
| Dead exports (5 functions) | Low | Removed |
| Stale/wrong .env.example | Medium | Rewrote with accurate env vars |
| Stale documentation (6 files) | Medium | Removed, consolidated |

## Technical Debt — Remaining

| Issue | Severity | Notes |
|-------|----------|-------|
| any for Firestore timestamps (src/types.ts) | Medium | Polymorphic type (Timestamp, Date, number, string). Changing could break date-utils. Deferred. |
| any for SpeechRecognition | Low | Unavoidable — Web Speech API types not standardised. |
| Large components (>300 lines) | Low | VoiceSettings 755, useChatManager 570, App 415. UI refactor deferred. |
| No unit or integration tests | High | No test framework exists. Out of scope. |
| No rate limiting | Medium | Out of scope. |
| No CORS config | Low | Same-origin currently. |

## Duplicate Code

| Location A | Location B | Type | Resolution |
|------------|------------|------|------------|
| server/ai/types.ts person/map/conversation types | src/types.ts user persona/inline mapAction | Shared domain concepts | Extracted to shared/types.ts |
| server/ai/config.ts env vars | server.ts env vars | Environment variable reads | Centralised in server/config/env.ts |

## Unused Files (Removed)

| File | Reason |
|------|--------|
| server.ts.backup | Old monolithic server. Not imported. |
| REFACTORING_COMPLETE.md | Stale refactoring summary. |
| CHANGELOG_REFACTOR.md | Overlapped with CHANGELOG.md. |
| SERVER_README.md | Stale. Documented old architecture. |
| SERVER_REFERENCE.md | Stale quick-reference. Superseded. |
| security_spec.md | Wrong product name (Bolna Sync). Stale. |

## Unused Exports (Removed)

| Export | File | Reason |
|--------|------|--------|
| printConfig | server/ai/config.ts | Dead code — never called. Used console.log. |
| listAvailableModels | server/ai/config.ts | Dead code — never called. |
| isValidJsonStart | server/ai/parser.ts | Dead code — never called. |
| isValidJson | server/ai/parser.ts | Dead code — never called. |
| withoutRetry | server/utils/retry.ts | Dead code — never called. |

## Recommendations

### Short-term
1. Add unit/integration tests (parser, retry, validation, errors).
2. Add rate limiting on /api/* routes.
3. Add CORS middleware.

### Medium-term
4. Refactor large components (VoiceSettings, useChatManager, App).
5. Add OpenTelemetry or Sentry for monitoring.
6. Type Firestore timestamps as a polymorphic union.

### Long-term
7. Add auth middleware (JWT / API keys).
8. Database-backed sessions.
9. Expand CI/CD pipeline with test running.

## Cleanup Performed

| Action | Count |
|--------|-------|
| Files removed | 6 |
| Dead exports removed | 5 |
| Files created | 6 (shared/types, config/env, config/version, utils/validation, middleware/error, routes/health) |
| Files modified | 10 (server.ts, server/ai/config, server/ai/types, server/ai/ollama, server/utils/errors, server/utils/logger, server/utils/retry, src/types, .env.example, tsconfig) |
| Docs updated | 5 (README, ARCHITECTURE, CHANGELOG, CONTRIBUTING, SECURITY) |
