# Noryx — Engineering Documentation

This directory contains the world-class engineering documentation for **Noryx**, a full-stack AI workspace with memory, retrieval-augmented generation (RAG), tooling, voice, and a security-hardened pipeline.

The goal of this documentation is that an experienced AI Engineer can understand the entire architecture **without reading the source code**.

## How to navigate

| Area | Document | What it covers |
|------|----------|----------------|
| **System** | [Architecture/SYSTEM_ARCHITECTURE.md](Architecture/SYSTEM_ARCHITECTURE.md) | High-level architecture, component responsibilities, request / streaming / conversation lifecycles, Workspace Intelligence, AI Monitor, Security layer, Knowledge Center. |
| **AI** | [AI/AI_ARCHITECTURE.md](AI/AI_ARCHITECTURE.md) | Provider layer, orchestrator, context builder, memory, RAG, embeddings, retriever, token budget, streaming, voice, prompt assembly, security pipeline, AI Monitor, with Mermaid request-flow diagrams. |
| **Backend** | [Backend/BACKEND.md](Backend/BACKEND.md) | Folder structure, services, routes, middleware, repositories, utilities, configuration, startup process, dependency graph. |
| **Frontend** | [Frontend/FRONTEND.md](Frontend/FRONTEND.md) | Component hierarchy, application state, streaming UI, conversation flow, Workspace Intelligence, Knowledge Center, AI Monitor, Voice, Lock Screen. |
| **Security** | [Security/SECURITY.md](Security/SECURITY.md) | Input security, output filtering, prompt injection, RAG protection, file validation, rate limiting, secret audit, telemetry, threat model, trust boundaries. |
| **API** | [Reference/API.md](Reference/API.md) | Every public endpoint: method, route, purpose, request, response, streaming behaviour, possible errors. |
| **Data Flow** | [DataFlow/DATA_FLOW.md](DataFlow/DATA_FLOW.md) | Mermaid diagrams for User→AI, User→RAG, User→Memory, Document Upload, Streaming, Voice, Knowledge Retrieval, Security Pipeline. |
| **Developer** | [Developer/DEVELOPER_GUIDE.md](Developer/DEVELOPER_GUIDE.md) | Install, run, environment variables, dev workflow, debugging, adding a provider / tool / memory / RAG feature. |
| **Deployment** | [Deployment/DEPLOYMENT.md](Deployment/DEPLOYMENT.md) | Build, production serving, environment configuration, ChromaDB, external services. |

## Supporting reference docs

- [Provider Failover](PROVIDER_FAILOVER.md) — multi-provider failover design.
- [Streaming Failover Fix](STREAMING_FAILOVER_FIX.md) — how streaming errors trigger provider retry.
- [Retrieval Architecture Verification](RETRIEVAL_ARCHITECTURE_VERIFICATION.md) — attachment-scoped RAG invariants.
- [Database Migrations](database-migrations.md) — SQLite migration system.

## Design principles

1. **Deterministic orchestration** — routing decisions (memory / RAG / tools) are made by a rule engine, never by an LLM call.
2. **Separation of concerns** — routes are thin HTTP controllers; business logic lives in services; security is centralised.
3. **Graceful degradation** — provider failures, parse errors, and unavailable RAG fall back instead of crashing.
4. **Security by default** — every request passes through input sanitisation, content filtering, and telemetry collection.
5. **Backend is source of truth** — the frontend never stores messages or documents locally; it always fetches from the API.

## Quick mental model

```
Browser (React)  ──HTTP/SSE──▶  Express routes  ──▶  ConversationService
                                                    ├─▶ Orchestrator (rule engine)
                                                    ├─▶ ContextBuilder (assembles prompt)
                                                    │     ├─▶ MemoryService (global + conversation)
                                                    │     ├─▶ RagService (attachment-scoped)
                                                    │     └─▶ Tool Engine (calculator, datetime)
                                                    ├─▶ AI Provider (Ollama / Groq / Gemini + failover)
                                                    ├─▶ AI Monitor (request-scoped telemetry)
                                                    └─▶ Security pipeline (input → output)
                              ▲
              SQLite (conversations, messages, global memory) + ChromaDB (document vectors)