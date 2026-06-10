import app from "./server";
import index from "./web/index.html";

const development = process.env.NODE_ENV !== "production";

const server = Bun.serve({
  // default to loopback: this serves your Messages database. Set
  // HOST=0.0.0.0 to expose it (pair with IMSGWEB_PASSWORD).
  hostname: process.env["HOST"] ?? "127.0.0.1",
  port: Number(process.env["PORT"] ?? 3000),
  routes: {
    "/": index,
    "/api/*": (req) => app.fetch(req),
  },
  development: development && { hmr: true, console: true },
});

console.log(`Listening on ${server.url}`);
