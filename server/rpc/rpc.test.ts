import { expect, test } from "bun:test";
import { RpcClient, RpcError } from "./index";

// Stands in for `imsg rpc`: NDJSON in, NDJSON out, exits when stdin closes.
// `send` exits without responding; watch.subscribe pushes its notifications
// in the same write batch as the response to exercise demux ordering, and
// kills the subscription when asked to watch chat_id 999.
const MOCK_SOURCE = `
const respond = (obj) => console.log(JSON.stringify(obj));
let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk.toString();
  let newline;
  while ((newline = buf.indexOf("\\n")) !== -1) {
    const line = buf.slice(0, newline).trim();
    buf = buf.slice(newline + 1);
    if (!line) continue;
    const { id, method, params = {} } = JSON.parse(line);
    if (method === "chats.list") {
      respond({ jsonrpc: "2.0", id, result: { chats: [{ id: 1, identifier: "+15551234567", guid: "iMessage;-;+15551234567", name: "Ada", service: "iMessage", last_message_at: "2026-06-10T00:00:00.000Z", participants: ["+15551234567"], is_group: false }] } });
    } else if (method === "messages.history") {
      respond({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params", data: "unknown chat_id" } });
    } else if (method === "watch.subscribe") {
      respond({ jsonrpc: "2.0", id, result: { subscription: 7 } });
      respond({ jsonrpc: "2.0", method: "message", params: { subscription: 7, message: { id: 101, text: "first" } } });
      respond({ jsonrpc: "2.0", method: "message", params: { subscription: 7, message: { id: 102, text: "second" } } });
      if (params.chat_id === 999) {
        respond({ jsonrpc: "2.0", method: "error", params: { subscription: 7, error: { message: "stream died" } } });
      }
    } else if (method === "watch.unsubscribe") {
      respond({ jsonrpc: "2.0", id, result: { ok: true } });
    } else if (method === "send") {
      process.exit(3);
    }
  }
});
process.stdin.on("end", () => process.exit(0));
`;
const MOCK_CMD = ["bun", "-e", MOCK_SOURCE];

test("call resolves with the typed result", async () => {
  const client = new RpcClient(MOCK_CMD);
  const { chats } = await client.call("chats.list");
  expect(chats).toHaveLength(1);
  expect(chats[0]?.name).toBe("Ada");
  await client.stop();
});

test("error responses reject with RpcError", async () => {
  const client = new RpcClient(MOCK_CMD);
  const error = await client
    .call("messages.history", { chat_id: 12345 })
    .then(() => null)
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(RpcError);
  if (error instanceof RpcError) {
    expect(error.code).toBe(-32602);
    expect(error.message).toBe("unknown chat_id");
    expect(error.label).toBe("Invalid params");
  }
  await client.stop();
});

test("watch yields pushed messages and unsubscribes on break", async () => {
  const client = new RpcClient(MOCK_CMD);
  const watch = await client.watch();
  expect(watch.subscription).toBe(7);
  const texts: string[] = [];
  for await (const message of watch) {
    texts.push(message.text);
    if (texts.length === 2) break;
  }
  expect(texts).toEqual(["first", "second"]);
  await client.stop();
});

test("watch throws when the subscription dies server-side", async () => {
  const client = new RpcClient(MOCK_CMD);
  const watch = await client.watch({ chat_id: 999 });
  const texts: string[] = [];
  let failure: Error | null = null;
  try {
    for await (const message of watch) texts.push(message.text);
  } catch (e) {
    failure = e as Error;
  }
  expect(texts).toEqual(["first", "second"]);
  expect(failure?.message).toBe("stream died");
  await client.stop();
});

test("in-flight calls reject when the process exits", async () => {
  const client = new RpcClient(MOCK_CMD);
  await expect(
    client.call("send", { to: "+15551234567", text: "hi" }),
  ).rejects.toThrow(/exited with code 3/);
});

test("stop ends open watches cleanly", async () => {
  const client = new RpcClient(MOCK_CMD);
  const watch = await client.watch();
  const consumed = (async () => {
    const texts: string[] = [];
    for await (const message of watch) texts.push(message.text);
    return texts;
  })();
  await client.stop();
  expect(await consumed).toEqual(["first", "second"]);
});
