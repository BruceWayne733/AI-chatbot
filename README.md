# Spur mini AI live chat agent

Small web app that simulates a customer support chat widget. A backend persists conversations and uses a real LLM (OpenAI) to answer common store questions (shipping/returns/support hours).

## Tech
- Backend: Node.js + TypeScript + Express
- DB: PostgreSQL via Prisma (Neon recommended)
- Frontend: Vite + TypeScript (simple chat widget)

## Local setup

### 1) Install deps
```bash
npm install
```

### 2) Backend env
Create `api/.env` (use `api/.env.example` as a template) and set your OpenAI key:
```bash
# api/.env
OPENAI_API_KEY=YOUR_KEY
```

Notes:
- API runs on `PORT` (default `3101`).
- DB is Postgres (Neon): `DATABASE_URL=postgresql://...`
- CORS is permissive in dev by default: `CORS_ORIGIN=*`

### 3) Create DB tables
```bash
npm -w api run prisma:generate
# Initialize tables in your Neon Postgres DB
npx -w api prisma db push
```

### 4) Frontend env
Create `web/.env` (use `web/.env.example` as a template) pointing to your API:
```bash
VITE_API_BASE=http://localhost:3101
```

### 5) Run
Run both servers:
```bash
npm run dev
```

- Web: printed by Vite (typically `http://localhost:5173`)
- API: `http://localhost:3101`

## API

### POST /chat/message
Body:
```json
{ "message": "Do you ship to USA?", "sessionId": "optional" }
```
Response:
```json
{ "reply": "...", "sessionId": "..." }
```

### GET /chat/history?sessionId=...
Response:
```json
{ "sessionId": "...", "messages": [{"sender":"user|ai","text":"...","createdAt":"..."}] }
```

## Architecture (backend)
- `api/src/index.ts`: HTTP routes + validation
- `api/src/llm.ts`: `generateReply(history)` wraps OpenAI with guardrails
- `api/src/prisma.ts`: Prisma client singleton
- `api/prisma/schema.prisma`: data model (`Conversation`, `Message`)

## LLM notes
- Provider: OpenAI (configurable via `OPENAI_MODEL`, default `gpt-5-nano`).
  - If the Responses API returns no user-visible text (can happen with some accounts/models), the backend falls back to `OPENAI_FALLBACK_MODEL` (default `gpt-4o-mini`).
  - For `gpt-5*` models, the backend uses the OpenAI **Responses API**.
  - For other models, it falls back to **Chat Completions**.
- Prompting:
  - System: “helpful e-commerce support agent”
  - FAQ policies are embedded and included in the system prompt.
  - Last ~30 messages are included for context.
- Guardrails:
  - Friendly messages for missing key, rate limits, and transient failures.
  - Input validated (non-empty, max 4000 chars).

## Trade-offs / If I had more time
- Store FAQ/policies in DB (or vector store) instead of hardcoding.
- Add streaming responses for better UX.
- Add a simple admin page to inspect conversations.
- Add tests for validation + persistence + LLM service.
