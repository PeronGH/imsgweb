import app from "./server";
import index from "./web/index.html";

const development = process.env.NODE_ENV !== "production";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": index,
    "/api/*": (req) => app.fetch(req),
  },
  development: development && { hmr: true, console: true },
});

console.log(`Listening on ${server.url}`);
