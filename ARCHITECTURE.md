# Architecture Guide — Noryx

> **This document is now superseded by the modular engineering documentation in [`docs/`](docs/README.md).**
>
> The full, current architecture — including component responsibilities, request/streaming/conversation lifecycles, the AI pipeline, Workspace Intelligence, AI Monitor, Security layer, and Knowledge Center — lives in:
>
> **[docs/Architecture/SYSTEM_ARCHITECTURE.md](docs/Architecture/SYSTEM_ARCHITECTURE.md)**
>
> Related deep-dives:
> - [AI Architecture](docs/AI/AI_ARCHITECTURE.md)
> - [Backend](docs/Backend/BACKEND.md)
> - [Frontend](docs/Frontend/FRONTEND.md)
> - [Security](docs/Security/SECURITY.md)
> - [API Reference](docs/Reference/API.md)
> - [Data Flow](docs/DataFlow/DATA_FLOW.md)
> - [Developer Guide](docs/Developer/DEVELOPER_GUIDE.md)
> - [Deployment](docs/Deployment/DEPLOYMENT.md)

---

## Summary (kept for quick reference)

The backend follows clean architecture: `routes → ai/services → config/middleware/utils`. Each module in `server/` has a single responsibility, and the dependency direction flows downward.

```
server/
├── config/          — Typed, validated env config (env.ts, version.ts)
├── ai/              — Provider layer, orchestrator, context builder, memory, RAG, tools, monitor
├── routes/          — Express controllers (chat, conversations, rag, health, summarize, tts)
├── middleware/      — Global error handler + 404 handler
├── security/        — Centralised security services (see docs/Security/SECURITY.md)
├── memory/          — Conversation + global memory
├── services/        — Cross-cutting services (health)
├── db/              — SQLite singleton + migrations
└── utils/           — Logger, errors, retry, validation

shared/
└── types.ts         — API contracts + domain models (shared by frontend & backend)
```

For the complete, up-to-date architecture, read [docs/Architecture/SYSTEM_ARCHITECTURE.md](docs/Architecture/SYSTEM_ARCHITECTURE.md).