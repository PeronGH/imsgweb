import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const app = new Hono()
  .basePath("/api")
  .get("/health", (c) => c.json({ status: "ok" as const }))
  .post(
    "/greet",
    zValidator("json", z.object({ name: z.string().min(1) })),
    (c) => {
      const { name } = c.req.valid("json");
      return c.json({ greeting: `Hello, ${name}!` });
    },
  );

export type AppType = typeof app;
export default app;
