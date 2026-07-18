# Noryx Security Architecture (Phase 7.4)

This document describes the security hardening implemented in **Phase 7.4 — Security Hardening** for the Noryx AI assistant. It covers the threat model, the centralized security services, and the protections added across input, output, files, RAG, API, and secrets.

---

## 1. Security Architecture

All security logic is centralized under `server/security/` and exposed through a single barrel (`server/security/index.ts`). No security logic is scattered across routes — every endpoint delegates to a reusable, testable service.

| Service | File | Responsibility |
|---------|------|----------------|
| `InputSecurityService` | `InputSecurityService.ts` | Sanitize, normalize, and validate user input |
| `ContentFilterService` | `ContentFilterService.ts` | Input + output content filtering with severity scoring |
| `PromptInjectionDetector` | `PromptInjectionDetector.ts` | RAG prompt-injection detection (flag, score, strip) |
| `FileValidationService` | `FileValidationService.ts` | Document upload validation & sanitization |
| `RateLimiter` | `RateLimiter.ts` | Per-client request rate limiting |
| `SecurityTelemetry` | `SecurityTelemetry.ts` | Request-scoped security event collector |
| `SecretAuditService` | `SecretAuditService.ts` | Startup secret & config audit |
| `SecurityConfig` | `SecurityConfig.ts` | Centralized, environment-overridable limits |
| `SecurityTypes` | `SecurityTypes.ts` | Shared security type vocabulary |
| `SecurityUtils` | `SecurityUtils.ts` | Shared helpers (control-char detection, etc.) |

---

## 2. Threat Model

| Threat | Vector | Mitigation |
|--------|--------|------------|
| Prompt injection | User text / RAG documents | `InputSecurityService`, `PromptInjectionDetector`, `ContentFilterService` |
| Jailbreak attempts | User text | Content filter categories + injection detector |
| Oversized inputs | Chat / upload | `maxInputLength`, `maxFileSizeMB` |
| Malformed JSON | HTTP body | `express.json` strict parsing → 400 |
| Unicode control chars | User text | `SecurityUtils.stripControlChars` |
| Invisible characters | User text | Zero-width / BIDI stripping |
| Token flooding | User text | Repeated-token detection |
| Malicious documents | Upload | `FileValidationService` (MIME, ext, size, dup) |
| RAG poisoning | Document text | `PromptInjectionDetector` strips instructions |
| Retrieval contamination | Query | Injection detector cleans query |
| Prompt leakage | Output | Output content filter |
| API abuse | HTTP | Rate limiting, size limits, timeouts |
| Secret leakage | Logs / responses | `SecretAuditService`, masked logging |

---

## 3. Input Validation (`InputSecurityService`)

**Responsibilities:**
- Sanitize user input (strip control/invisible chars)
- Normalize whitespace (collapse, trim, limit newlines)
- Remove dangerous control characters (NULL, BIDI overrides, zero-width)
- Enforce maximum length (`SecurityConfig.maxInputLength`, default 20,000 chars)
- Reject malformed payloads (non-string, empty after trim)
- Detect token flooding (repeated token sequences)

**Configurable limits** (env overrides):
- `SEC_MAX_INPUT_LENGTH`
- `SEC_MAX_NEWLINES`
- `SEC_MAX_REPEATED_CHARS`
- `SEC_MAX_TOKEN_REPETITIONS`

**Decision vocabulary:** `allow` | `warn` | `redact` | `block`

---

## 4. Output Filtering (`ContentFilterService`)

Applied to **both** input and output. The filter **classifies, decides, and acts** — it does not blindly censor.

**Categories:** `BANNED_WORDS`, `ABUSIVE_LANGUAGE`, `HATE_SPEECH`, `EXPLICIT_SEXUAL`, `GRAPHIC_VIOLENCE`, `ILLEGAL_ACTIVITY`, `SELF_HARM`, `MALWARE_GENERATION`, `PROMPT_INJECTION`.

**Dispositions:**
- `allow` — safe, proceed
- `warn` — suspicious, proceed but flag (telemetry)
- `redact` — remove sensitive spans, continue
- `block` — unsafe, reject request (400)

**Features:**
- Configurable rule list (`SecurityConfig.contentRules`)
- Configurable allowlist (`SecurityConfig.contentAllowlist`)
- Severity scoring (0–100) with thresholds
- Logging **without** storing sensitive content (rule labels + counts only)

---

## 5. Prompt Injection Defense (`PromptInjectionDetector`)

Per the RAG security spec, we **do not automatically reject**. Instead we:

1. **Flag** — detect patterns (`ignore previous instructions`, `reveal system prompt`, `forget previous rules`, `execute commands`, `developer mode`, `act as`, etc.)
2. **Score** — aggregate severity (0–100)
3. **Remove** — strip malicious instruction spans from the text
4. **Continue** — retrieval proceeds safely with cleaned text

This prevents document poisoning, retrieval contamination, and prompt leakage while preserving legitimate queries.

---

## 6. File Security (`FileValidationService`)

**Validates:**
- MIME type (allowlist: PDF, TXT, MD, DOCX, CSV)
- File extension (matches MIME)
- Filename (sanitized, no traversal, no hidden files, valid chars)
- Maximum size (`SecurityConfig.maxFileSizeMB`, default 10 MB)
- Duplicate uploads (name + size hash against existing docs)

**Rejects:** executables, archives, scripts, unsupported formats.

**Sanitizes:** filenames, metadata, document identifiers.

**Prevents:** directory traversal (`../`), hidden filenames (`.env`), invalid characters.

---

## 7. API Security (Part 5)

Implemented in `server.ts` and the route handlers:

- **Request size limits** — `express.json({ limit: SEC_JSON_BODY_LIMIT })` (default 10mb)
- **Rate limiting** — `RateLimiter` per client IP (default 100 req / 60s window)
- **Payload validation** — `validateChatRequest` + security sanitization
- **Request timeout** — `SEC_REQUEST_TIMEOUT_MS` (default 120s) → 408
- **Invalid JSON** — `express.json` strict mode → 400 with error shape
- **Graceful errors** — consistent HTTP status codes via `middleware/error.ts`
- **Provider failure** — `OllamaError` / `ParseError` caught → 200 with user-friendly fallback message (no crash, no internal state leaked)

---

## 8. Secret Handling (`SecretAuditService`)

- Audits environment variables, provider keys, and API secrets at startup
- **Never** exposes secrets in logs or responses
- **Never** logs secret values (even at debug level)
- Validates startup configuration
- Warns for missing required secrets (`GROQ_API_KEY` when Groq is active)
- `maskSecret()` utility for safe diagnostics display

---

## 9. Security Telemetry (Part 8)

The AI Monitor now includes a **Security** section. For every request, `SecurityTelemetry` aggregates:

- Input Filter decision
- Output Filter decision
- Prompt Injection Attempts
- Rejected Files
- Rate Limited Requests
- Blocked Requests

**No sensitive user data is ever displayed.** Only counters, category labels, and dispositions are stored.

Frontend: `src/components/AIMonitorPanel.tsx` renders the Security card (collapsed chip + expanded detail).

---

## 10. Rate Limiting

`RateLimiter` is an in-memory fixed-window limiter keyed by client identifier (X-Forwarded-For or socket IP).

- Default: `SEC_RATE_LIMIT_MAX = 100` requests per `SEC_RATE_LIMIT_WINDOW_MS = 60000` ms
- Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers
- On exceed: `429` with `{ error: { code: "RATE_LIMITED" } }` + security telemetry

> Note: In-memory limiting is per-process. For multi-instance deployments, swap the store for Redis (interface is isolated in `RateLimiter.ts`).

---

## 11. Known Limitations

1. **In-memory rate limiting** — not shared across server instances; use Redis in production clusters.
2. **Heuristic content filtering** — rule-based; may produce false positives/negatives. Allowlist tuning recommended for production vocabularies.
3. **Prompt-injection stripping** is pattern-based — novel obfuscation may evade detection. Defense-in-depth (output filter + system-prompt hardening) mitigates residual risk.
4. **File type validation** relies on MIME + extension; content-based magic-number checks are a future enhancement.
5. **Secret audit** validates presence, not validity — a malformed but present key is not detected here.
6. **No per-user quotas** — rate limiting is per-IP, not per-account.

---

## 12. Validation

Run the security validation suite:

```bash
npx tsx tmp/security-validation.ts
```

Covers: Prompt Injection, Oversized Input, Malformed JSON, Huge PDF, Duplicate Upload, Unsupported File, Missing API Key, Provider Failure, RAG Poisoning, Rate Limiting, Content Filter, Unicode Sanitization.

Build & type-check:

```bash
npm run build
npx tsc --noEmit