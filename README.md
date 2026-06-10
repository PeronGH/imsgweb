# imsgweb

Full-stack Bun app that compiles to a single binary. Svelte 5 + Tailwind v4
frontend (`web/`, bundled by Bun — no Vite) and a Hono + Zod API (`server/`)
with end-to-end typed calls via Hono RPC.

## Usage

```bash
bun install
bun run dev      # dev server with HMR on http://localhost:3000
bun run build    # standalone binary at dist/imsgweb
bun run check    # svelte-check (type-checks .ts and .svelte)
bun run lint     # eslint
bun run format   # prettier
```

## Example

Add an API route in `server/index.ts` (keep the chained style so RPC types
flow to the client):

```ts
const app = new Hono()
  .basePath("/api")
  .post("/greet", zValidator("json", z.object({ name: z.string() })), (c) =>
    c.json({ greeting: `Hello, ${c.req.valid("json").name}!` }),
  );
```

Call it from Svelte with full type inference via `web/api.ts`:

```ts
const res = await api.greet.$post({ json: { name } });
const { greeting } = await res.json();
```
