import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  ATTACHMENT_STORES,
  attachmentResponse,
  resolveAttachmentPath,
} from "./attachments";
import { toApiChat, toApiMessage } from "./payloads";
import { rpc, RpcError, RpcErrorCode, RpcExitError } from "./rpc";

const limitSchema = z.coerce.number().int().min(1).max(200).default(50);

const sendForm = z
  .object({
    to: z.string().min(1).optional(),
    chat_id: z.coerce.number().int().positive().optional(),
    text: z.string().optional(),
    file: z.instanceof(File).optional(),
  })
  .refine((form) => (form.to === undefined) !== (form.chat_id === undefined), {
    message: "provide exactly one of to or chat_id",
  })
  .refine((form) => Boolean(form.text?.trim()) || form.file !== undefined, {
    message: "provide text and/or file",
  });

const app = new Hono()
  .basePath("/api")
  .onError((error, c) => {
    if (error instanceof RpcError) {
      const status = error.code === RpcErrorCode.InvalidParams ? 400 : 502;
      return c.json({ error: error.message }, status);
    }
    if (error instanceof RpcExitError) {
      return c.json({ error: error.message }, 502);
    }
    console.error(error);
    return c.json({ error: "internal error" }, 500);
  })
  .get("/health", (c) => c.json({ status: "ok" as const }))

  // Chat list, aggregated with a last-message preview per chat. The point
  // queries pipeline through the single rpc child (local SQLite) — cheap.
  .get(
    "/chats",
    zValidator("query", z.object({ limit: limitSchema })),
    async (c) => {
      const { limit } = c.req.valid("query");
      const { chats } = await rpc.call("chats.list", { limit });
      const previews = await Promise.all(
        chats.map((chat) =>
          // attachments give the preview a label when the text is
          // placeholder-only ("Image", "Sticker", …)
          rpc.call("messages.history", {
            chat_id: chat.id,
            limit: 1,
            attachments: true,
          }),
        ),
      );
      return c.json({
        chats: chats.map((chat, i) =>
          toApiChat(chat, previews[i]?.messages.at(-1)),
        ),
      });
    },
  )

  // History page, normalized to oldest→newest. imsg returns newest-first
  // (docs/rpc.md claims the opposite; the handler never reverses its
  // date-DESC query) and its `end` bound is exclusive (m.date < end), so
  // next_before = oldest created_at pages without duplicates.
  .get(
    "/chats/:chatId/messages",
    zValidator(
      "param",
      z.object({ chatId: z.coerce.number().int().positive() }),
    ),
    zValidator(
      "query",
      z.object({ limit: limitSchema, before: z.iso.datetime().optional() }),
    ),
    async (c) => {
      const { chatId } = c.req.valid("param");
      const { limit, before } = c.req.valid("query");
      const { messages } = await rpc.call("messages.history", {
        chat_id: chatId,
        limit,
        end: before,
        attachments: true,
      });
      const ordered = [...messages].sort((a, b) => a.id - b.id);
      return c.json({
        messages: ordered.map(toApiMessage),
        next_before:
          messages.length === limit ? (ordered[0]?.created_at ?? null) : null,
      });
    },
  )

  // Global SSE stream of new messages across all chats. The SSE event id is
  // the message rowid; EventSource's Last-Event-ID on reconnect becomes the
  // watch's since_rowid, so resume needs no server-side state.
  .get(
    "/events",
    zValidator(
      "query",
      z.object({ since: z.coerce.number().int().nonnegative().optional() }),
    ),
    (c) => {
      const lastEventId = Number(c.req.header("last-event-id"));
      const since = Number.isFinite(lastEventId)
        ? lastEventId
        : c.req.valid("query").since;
      return streamSSE(
        c,
        async (stream) => {
          // flush a first byte so the browser's EventSource fires `open`
          // immediately instead of waiting for the first event
          await stream.write(": connected\n\n");
          const watch = await rpc.watch({
            since_rowid: since,
            attachments: true,
            include_reactions: true,
          });
          stream.onAbort(() => void watch.unsubscribe());
          const heartbeat = setInterval(
            () => void stream.write(": ping\n\n"),
            25_000,
          );
          try {
            for await (const message of watch) {
              await stream.writeSSE({
                event: "message",
                id: String(message.id),
                data: JSON.stringify(toApiMessage(message)),
              });
            }
          } finally {
            clearInterval(heartbeat);
          }
        },
        // Watch death lands here; closing the stream makes EventSource
        // reconnect with Last-Event-ID and resume from its cursor.
        (error) => {
          console.error("sse stream error:", error);
          return Promise.resolve();
        },
      );
    },
  )

  // Send text and/or a file. Uploads are staged to a temp file only for the
  // lifetime of the request — imsg's send API takes a local path.
  .post("/messages", zValidator("form", sendForm), async (c) => {
    const { to, chat_id, text, file } = c.req.valid("form");
    let staged: string | undefined;
    try {
      if (file) {
        staged = join(
          tmpdir(),
          `imsgweb-${crypto.randomUUID()}-${file.name.replaceAll("/", "_")}`,
        );
        await Bun.write(staged, file);
      }
      const params = { text, file: staged, service: "auto" as const };
      const result =
        to !== undefined
          ? await rpc.call("send", { to, ...params })
          : await rpc.call("send", { chat_id, ...params });
      return c.json(result);
    } finally {
      if (staged !== undefined) {
        await Bun.file(staged)
          .delete()
          .catch(() => undefined);
      }
    }
  })

  // Delivery status point query — frontend polls this after a send.
  .get("/messages/:guid/status", async (c) =>
    c.json(
      await rpc.call("message.send_status", { guid: c.req.param("guid") }),
    ),
  )

  // Attachment bytes, browser-cacheable (immutable files + ETag/304/Range).
  // URLs are store-relative; see attachmentUrl in server/attachments.ts.
  .get(
    "/attachments/:store/:path{.+}",
    zValidator(
      "param",
      z.object({ store: z.enum(ATTACHMENT_STORES), path: z.string().min(1) }),
    ),
    async (c) => {
      const { store, path } = c.req.valid("param");
      const filePath = resolveAttachmentPath(store, path);
      if (filePath === null) {
        return c.json({ error: "not found" }, 404, {
          "cache-control": "no-store",
        });
      }
      return attachmentResponse(filePath, c.req.raw.headers);
    },
  );

export type AppType = typeof app;
export default app;
