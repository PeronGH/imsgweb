import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";

// Route the shared rpc client at the mock before its first spawn; the
// Hono app is exercised in-process via app.request (no port, no server).
process.env["IMSGWEB_RPC_CMD"] = `bun ${join(import.meta.dir, "rpc/mock.ts")}`;
const { default: app } = await import("./index");
const { rpc } = await import("./rpc");

afterAll(async () => {
  await rpc.stop();
});

interface MessagesPage {
  messages: Array<{ text: string; created_at: string }>;
  next_before: string | null;
}

test("history responds oldest-first with a cursor that pages", async () => {
  // imsg returns newest-first; the route must normalize and cursor from
  // the oldest row — regression test for one-message-per-page paging
  const res = await app.request("/api/chats/1/messages?limit=1");
  expect(res.status).toBe(200);
  const page1 = (await res.json()) as MessagesPage;
  expect(page1.messages.map((m) => m.text)).toEqual(["second"]);
  expect(page1.next_before).toBe(page1.messages[0]?.created_at ?? "");

  const res2 = await app.request(
    `/api/chats/1/messages?limit=1&before=${encodeURIComponent(page1.next_before ?? "")}`,
  );
  const page2 = (await res2.json()) as MessagesPage;
  expect(page2.messages.map((m) => m.text)).toEqual(["first"]);
});

test("attachment route matches nested store-relative paths", async () => {
  // our handler responds (404 no-store for an absent file) — Hono's bare
  // 404 would carry no cache-control, meaning :path{.+} didn't match
  const res = await app.request(
    "/api/attachments/messages/ab/cd/does-not-exist.heic",
  );
  expect(res.status).toBe(404);
  expect(res.headers.get("cache-control")).toBe("no-store");

  const traversal = await app.request(
    "/api/attachments/messages/..%2F..%2F.ssh%2Fid_ed25519",
  );
  expect(traversal.status).toBe(404);

  const badStore = await app.request("/api/attachments/etc/passwd");
  expect(badStore.status).toBe(400);
});

test("events stream flushes immediately and forwards sends", async () => {
  const controller = new AbortController();
  const res = await app.request("/api/events", { signal: controller.signal });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const body = res.body;
  expect(body).not.toBeNull();
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();

  // first bytes arrive before any event so EventSource fires `open`
  let received = decoder.decode((await reader.read()).value, { stream: true });
  expect(received).toContain(": connected");

  const form = new FormData();
  form.set("chat_id", "1");
  form.set("text", "sse echo");
  const sent = await app.request("/api/messages", {
    method: "POST",
    body: form,
  });
  expect(sent.status).toBe(200);

  while (!received.includes("sse echo")) {
    const { value, done } = await reader.read();
    if (done) break;
    received += decoder.decode(value, { stream: true });
  }
  expect(received).toContain("event: message");
  expect(received).toContain('"text":"sse echo"');
  expect(received).toMatch(/\nid: \d+\n/);
  controller.abort();
});
