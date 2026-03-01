# ExoSkull v2 — Claude Code Wrapper

> Cyfrowy żywy organizm. Claude Code jako układ nerwowy.

## Architecture (4 layers, not 18)

```
Layer 4: Channels   — Web | Desktop | Voice | SMS | Telegram
Layer 3: Organism   — Memory | Knowledge | Self-mod | ONE Autonomy Loop
Layer 2: Wrapper    — Chat UI | Code viewer | Diff viewer | Terminal | File browser
Layer 1: Nervous    — Claude Code (Desktop: CLI subprocess | Web: Anthropic API + VPS)
```

## Monorepo Structure

```
apps/web/           — Next.js 15 web app (Railway)
apps/desktop/       — Tauri v2 desktop app
packages/ui/        — Shared React components (chat, code, common)
packages/engine/    — Chat engine (SSE streaming, tools)
packages/store/     — Zustand stores
packages/types/     — Shared TypeScript types
services/vps-executor/ — VPS code execution sandbox
```

## Dev Commands

```bash
npm run dev           # All apps
npm run dev:web       # Web only (localhost:3000)
npm run dev:desktop   # Desktop only (Tauri + Vite)
npm run build         # Build all
npm run build:web     # Build web
```

## Key Principles

1. **Claude Code IS the app** — we render, Claude Code executes
2. **4 layers max** — no 18-layer architecture
3. **8 DB tables max** — no 40+ orphaned tables
4. **ONE autonomy loop** — Observe → Act → Verify → Learn
5. **21k LOC target** — not 120k
6. **E2E or nothing** — every feature must deliver value to user

## Stack

| Layer | Tech |
|-------|------|
| Web | Next.js 15, React 19, Tailwind 4 |
| Desktop | Tauri v2, Rust |
| UI | shadcn/ui, Radix, Lucide |
| State | Zustand |
| DB | Supabase (Postgres + pgvector) |
| AI | Anthropic API (Claude) |
| Voice | Cartesia TTS + Deepgram STT |
| Monitoring | Sentry |
