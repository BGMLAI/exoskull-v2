# ExoSkull v2 — Goal Executor

> Adaptive Life Operating System. Sole purpose: achieve user goals.

## Architecture (4 layers)

```
Layer 4: CHANNELS ─── Telegram | Web (SSE) | SMS | Voice | Desktop
Layer 3: GATEWAY ──── Router → Lane Queue → Session → Stream
Layer 2: ENGINE ───── ReAct Loop → Tools → Memory → Heartbeat → Events
Layer 1: STORE ────── Supabase (8 tables) + pgvector + R2 blobs
```

## Monorepo Structure

```
apps/web/              — Next.js 15 web app
apps/desktop/          — Tauri v2 desktop app (Phase 4)
packages/types/        — All shared TypeScript interfaces (~300 LOC)
packages/store/        — Supabase CRUD for 8 tables (~700 LOC)
packages/engine/       — Agent brain: ReAct loop, tools, gateway (~1500 LOC)
packages/ui/           — Shared React components (chat, code)
services/vps-executor/ — VPS code execution sandbox
supabase/migrations/   — 8 tables: tenants, events, memory, goals, tools, queue, connections, blobs
```

## DB Schema (8 Tables)

| Table | Purpose |
|-------|---------|
| tenants | Identity, settings, permissions, channel IDs |
| events | Append-only event log (event-sourced state) |
| memory | Unified memory: facts, episodes, notes, SOUL, MEMORY |
| goals | Hierarchical tree: value → area → quest → task |
| tools | Dynamic tool registry (built-in + user-generated) |
| queue | Unified work queue (replaces 43 CRONs) |
| connections | External integrations (OAuth, API keys) |
| blobs | File storage metadata |

## Dev Commands

```bash
npm run dev           # All apps (Turbo)
npm run dev:web       # Web only (localhost:3000)
npm run build         # Build all
npm run build:web     # Build web

# Type checking
npx tsc --noEmit -p packages/types/tsconfig.json
npx tsc --noEmit -p packages/store/tsconfig.json
npx tsc --noEmit -p packages/engine/tsconfig.json
cd apps/web && npx next build
```

## Key Principles

1. **Goal-driven everything** — every feature traces to a user goal
2. **4 layers max** — Store → Engine → Gateway → Channels
3. **8 DB tables** — JSONB for flexibility, TypeScript for structure
4. **Event-sourced** — every agent action is immutable, enables crash recovery
5. **SOUL + MEMORY** — 2 pre-computed text blobs replace 15 DB queries
6. **ReAct loop** — Reason → Act → Observe, with parallel tool execution
7. **Single queue** — one CRON route, priority-based processing
8. **~23k LOC target** — currently ~3.5k LOC (Phase 1)

## Agent Tools (Phase 1 — 8 core)

define_goal, check_goals, log_goal_progress, add_task, list_tasks, complete_task, search_brain, remember

## Stack

| Layer | Tech |
|-------|------|
| Build | Turborepo |
| Web | Next.js 15, React 19, Tailwind 4 |
| Desktop | Tauri v2, Rust |
| AI | Anthropic API (Claude Sonnet 4.6) |
| DB | Supabase (Postgres + pgvector) |
| Voice | Cartesia TTS + Deepgram STT |

## Implementation Phases

- [x] Phase 1: Goal → Strategy → Tasks (closed loop) — DB, store, engine, auth, SSE
- [ ] Phase 2: Memory + Tools + App Builder (BMAD pipeline, self-extending agent)
- [ ] Phase 3: Heartbeat + Multi-Channel (Telegram, queue worker)
- [ ] Phase 4: Polish + Desktop + Outbound Calling
