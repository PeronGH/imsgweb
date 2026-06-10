# imsgweb

A web UI for iMessage on your Mac. Browse chats, read history, get live
messages, and send texts and attachments from the browser — powered by
[imsg](https://github.com/openclaw/imsg) talking to the local Messages
database, wrapped in a single self-contained binary.

## Requirements

- macOS with Messages signed in
- [imsg](https://github.com/openclaw/imsg) on your PATH:

  ```bash
  brew install steipete/tap/imsg
  ```

- Full Disk Access for the terminal (or binary) that runs imsgweb —
  System Settings → Privacy & Security → Full Disk Access. Required to
  read the Messages database.

## Run

Grab the latest binary from
[releases](https://github.com/PeronGH/imsgweb/releases) and run it:

```bash
./imsgweb            # serves http://localhost:3000 (PORT to override)
```

Or run from source with [Bun](https://bun.sh):

```bash
bun install
bun run dev          # dev server with HMR on http://localhost:3000
```

## Development

```bash
bun run build        # standalone binary at dist/imsgweb
bun test             # unit + route tests (run against a mock imsg)
bun run check        # svelte-check
bun run lint         # eslint
bun run format       # prettier
```

To build a binary that bundles imsg itself (no separate install needed on
the target machine), point `IMSGWEB_EMBED_IMSG` at the real imsg binary —
not the homebrew shim:

```bash
IMSGWEB_EMBED_IMSG="$(brew --prefix imsg)/libexec/imsg" bun run build
```

An embedded build always uses its bundled imsg and refuses
`IMSGWEB_RPC_CMD`.

To develop without the imsg binary or Full Disk Access, point the server
at the bundled mock (`--interval 4000` emits a synthetic incoming message
every 4s):

```bash
IMSGWEB_RPC_CMD="bun server/rpc/mock.ts --interval 4000" bun run dev
```
