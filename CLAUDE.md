# imsgweb

Full-stack Bun app that compiles to a single binary (`dist/imsgweb`).
Svelte 5 SPA in `web/`, Hono + Zod API in `server/`, end-to-end typed via Hono RPC.
No Vite, no Node.js — Bun bundles everything, including the frontend.

## Commands

- `bun run dev` — dev server with HMR on http://localhost:3000
- `IMSGWEB_RPC_CMD="bun server/rpc/mock.ts" bun run dev` — dev against the
  fixture mock (no imsg binary / Full Disk Access needed); add
  `--interval 3000` to the cmd for synthetic incoming messages
- `bun run build` — standalone binary at `dist/imsgweb`
- `bun run check` — svelte-check (type-checks `.ts` and `.svelte`)
- `bun run lint` / `bun run format` — ESLint / Prettier

All of check, lint, and format must pass before committing.

## Architecture

- `index.ts` — entry point. `Bun.serve()` serves the imported `web/index.html`
  at `/` and delegates `/api/*` to the Hono app.
- `server/index.ts` — Hono app on `.basePath("/api")`. Validate request bodies
  with `zValidator` from `@hono/zod-validator`. Routes MUST stay in the chained
  style (`new Hono().get(...).post(...)`) — `export type AppType` powers the
  RPC client, and standalone `app.get(...)` calls break type inference.
  Endpoints expose only imsg's SIP-on surface; live updates are SSE
  (`/api/events`, resume via Last-Event-ID = message rowid), never WebSocket.
  The server is stateless: imsg is the source of truth, aggregation happens
  per request. Helpers: `server/payloads.ts` (RPC → frontend shapes),
  `server/attachments.ts` (path-validated, browser-cacheable file serving).
- `web/api.ts` — typed client: `hc<AppType>(...)`. Frontend calls the API only
  through this client.
- `server/rpc/` — client for the imsg binary (the `imsg/` submodule, pinned
  v0.11.1). Spawns `imsg rpc` from PATH and speaks JSON-RPC 2.0 over NDJSON
  stdio. `rpc.call(...)` is typed via the method map in `server/rpc/types.ts`
  (hand-written wire types — keep in sync when bumping the submodule);
  `rpc.watch(...)` returns an async-iterable message stream.
- `imsg/` — git submodule, reference only (Swift source + docs); excluded
  from lint/format. Not built by this repo.
- `web/` — Svelte 5 with runes (`$state`, `$derived`; `mount` from `svelte`).
  Client-side rendering only: `bun-plugin-svelte` does not support SSR.
- `web/app.css` — `@import "tailwindcss"` (Tailwind v4, no config file).

## Build pipeline

- Dev: `bunfig.toml` registers `bun-plugin-svelte` and `bun-plugin-tailwind`
  under `[serve.static]` so the dev server compiles `.svelte` files and
  Tailwind on the fly.
- Production: `build.ts` uses the `Bun.build()` JS API with
  `compile: { outfile }` and the same plugins. A build script is required —
  the `bun build` CLI does not support plugins.

## Gotchas

- Compiled Bun binaries default `NODE_ENV` to `development`. `build.ts` inlines
  `process.env.NODE_ENV = "production"` via `define`; don't remove it, or the
  binary serves unminified assets with HMR enabled.
- Style with Tailwind utility classes in markup. Tailwind syntax (`@apply`)
  inside Svelte `<style>` blocks is not processed by the plugin.

## Bun conventions

- `bun <file>`, `bun test`, `bun install`, `bunx` — never node/npm/npx/vite/jest.
- Prefer built-ins: `Bun.serve()`, `bun:sqlite`, `Bun.file`, `Bun.$`, built-in
  `WebSocket` — over express/better-sqlite3/node:fs/execa/ws.
- Bun loads `.env` automatically — don't use dotenv.
- Bun API docs: `node_modules/bun-types/docs/**.mdx`.
