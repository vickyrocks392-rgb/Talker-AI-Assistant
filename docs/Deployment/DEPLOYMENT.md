# Deployment Guide

How to build and run **Noryx** in production, and how to configure its external dependencies.

- Developer setup: [../Developer/DEVELOPER_GUIDE.md](../Developer/DEVELOPER_GUIDE.md)
- Backend: [../Backend/BACKEND.md](../Backend/BACKEND.md)

---

## 1. Build

```bash
npm run build
```

This runs two steps (see `package.json`):
1. `vite build` — bundles the React frontend into `dist/`.
2. `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/server.cjs` — bundles the backend (externalising `node_modules`).

The result is a self-contained `dist/` directory containing both the SPA and the server bundle.

---

## 2. Run (production)

```bash
NODE_ENV=production npm start
```

`npm start` runs `node dist/server.cjs`. In production mode (`server.ts`):
- The Vite dev middleware is **not** mounted.
- Express serves the static `dist/` folder.
- A catch-all `app.get("*")` returns `dist/index.html` (SPA routing).

The server listens on `PORT` (default `3000`), bound to `0.0.0.0`.

---

## 3. Environment configuration

Set the variables from [../Developer/DEVELOPER_GUIDE.md](../Developer/DEVELOPER_GUIDE.md#4-environment-variables) in the production environment. At minimum:
- `NODE_ENV=production`
- `AI_PROVIDER` + the matching API key/model.
- `CHROMA_HOST` / `CHROMA_PORT` if RAG is used.
- Security limits as desired (`SEC_RATE_LIMIT_*`, `SEC_MAX_INPUT_LENGTH`, etc.).

---

## 4. External services

### Ollama
- Required for the `ollama` provider. Run `ollama serve` and ensure `OLLAMA_URL` is reachable from the server.
- Pull the model named by `OLLAMA_MODEL`.

### ChromaDB
- Required for RAG / Knowledge Center. Run a Chroma server and point `CHROMA_HOST` / `CHROMA_PORT` at it.
- The collection `talker_rag` is created lazily on first use.
- If Chroma is unavailable, the server still boots; RAG retrieval returns `null` and chat works without document context.

### Groq / Gemini
- Only needed when enabled via failover (`AI_FAILOVER_ENABLED=true` + keys present).
- The active provider is chosen by `AI_PROVIDER` in single-provider mode.

### SQLite
- Local file at `storage/talker.db` (created automatically; WAL mode enabled).
- Migrations run on first `getDatabase()` call. Ensure the `storage/` directory is writable and persisted across restarts.

### Firebase (frontend auth)
- Configured in `src/lib/firebase.ts` via environment-specific config. The backend does not depend on Firebase.

---

## 5. Reverse proxy (recommended)

Place Noryx behind a reverse proxy (nginx, Caddy, or a cloud LB):
- Terminate TLS at the proxy.
- Forward `/api/*` and `/health`, `/ready`, `/version` to the Node process.
- Increase client body size limit if uploading large documents (the server also enforces `SEC_JSON_BODY_LIMIT` and `RAG_MAX_UPLOAD_SIZE_MB`).
- For multi-instance deployments, replace the in-memory `RateLimiter` with a shared store (Redis) — see [../Security/SECURITY.md](../Security/SECURITY.md).

---

## 6. Health checks

- **Liveness:** `GET /health` → `200` while the process is alive.
- **Readiness:** `GET /ready` → `200` when the AI provider is reachable, else `503`.
- **Deep health:** `GET /api/system/health` → tri-state report for all components (used by the Workspace Intelligence sidebar).

Use `/health` and `/ready` for container orchestration probes.

---

## 7. Notes & caveats

- The build externalises `node_modules`, so `node_modules` must be present in the deployment (or use a bundler that inlines them).
- No hot-reload in production; restart the process to pick up changes.
- Secret audit runs at startup and warns (does not fail) on missing keys.