# Talker AI — Full-Stack Voice Companion

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blueviolet)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

Talker AI is a **production-quality conversational AI assistant** that runs local LLMs via [Ollama](https://ollama.ai). It remembers user preferences, searches OpenStreetMap locations, provides turn-by-turn directions, and supports hands-free voice interaction — all with zero API key costs for maps.

---

## Architecture

```
PRESENTATION: React 19 · Tailwind CSS 4 · Leaflet · Web Speech API
       ↓  REST APIs + Firestore Sync
CUSTOM HOOKS: useChatManager · useVoiceAssistant · useAuthAndProfile
       ↓  POST /api/*
EXPRESS BACKEND: Routes → AI → Utils → Middleware
       ↓
EXTERNAL: Ollama (local LLM) · Firebase (Auth + Firestore) · OSM/Nominatim/OSRM
```

---

## Quick Start

### Prerequisites
- Node.js v18+
- [Ollama](https://ollama.ai/) running (`ollama serve`)
- An Ollama model pulled (`ollama pull llama3.2:3b`)

### Setup
```bash
npm install
cp .env.example .env
npm run dev
```

### Build for production
```bash
npm run build
npm start
```

---

## Environment Variables

| Variable     | Default                    | Description                      |
|--------------|----------------------------|----------------------------------|
| PORT         | 3000                       | Backend HTTP port                |
| NODE_ENV     | development                | development or production        |
| OLLAMA_URL   | http://127.0.0.1:11434     | Ollama server URL                |
| OLLAMA_MODEL | llama3.2:3b                | Model name                       |

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| /health  | GET    | Liveness probe (200) |
| /ready   | GET    | Readiness probe (200 / 503) |
| /version | GET    | Build metadata |
| /api/chat | POST  | Send a message (streaming or regular) |
| /api/summarize | POST | Generate session title |
| /api/tts | POST   | Text-to-speech fallback |

---

## Project Structure

```
shared/types.ts      — Shared domain types (API contracts, Persona, MapAction)
server/config/       — Centralised typed config + version
server/ai/           — LLM logic (Ollama provider, prompts, parser, summarize)
server/routes/       — Express route handlers (chat, summarize, tts, health)
server/middleware/   — Global error handler + API 404
server/utils/        — Logger, errors, retry, validation
src/                 — React frontend (components, hooks, lib, maps)
```

---

## License

MIT

