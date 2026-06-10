import { expect, test } from "bun:test";
import { join } from "node:path";
import { RpcClient, RpcError } from "./index";

// The centralized imsg stand-in; see mock.ts for fixtures and triggers.
const MOCK_CMD = ["bun", join(import.meta.dir, "mock.ts")];

test("call resolves with the typed result", async () => {
  const client = new RpcClient(MOCK_CMD);
  const { chats } = await client.call("chats.list");
  expect(chats.length).toBeGreaterThanOrEqual(3);
  expect(chats.map((chat) => chat.name)).toContain("Ada");
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

test("watch replays from since_rowid and unsubscribes on break", async () => {
  const client = new RpcClient(MOCK_CMD);
  const watch = await client.watch({ chat_id: 1, since_rowid: 0 });
  expect(watch.subscription).toBe(1);
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
  const watch = await client.watch({ chat_id: 999, since_rowid: 0 });
  const texts: string[] = [];
  let failure: Error | null = null;
  try {
    for await (const message of watch) texts.push(message.text);
  } catch (e) {
    failure = e as Error;
  }
  expect(texts).toEqual(["doomed one", "doomed two"]);
  expect(failure?.message).toBe("stream died");
  await client.stop();
});

test("sends echo to live watches and report delivered status", async () => {
  const client = new RpcClient(MOCK_CMD);
  const watch = await client.watch({ chat_id: 1 });
  const result = await client.call("send", { chat_id: 1, text: "hi" });
  expect(result.ok).toBe(true);
  for await (const message of watch) {
    expect(message.text).toBe("hi");
    expect(message.is_from_me).toBe(true);
    expect(message.guid).toBe(result.guid ?? "");
    break;
  }
  const status = await client.call("message.send_status", {
    guid: result.guid ?? "",
  });
  expect(status.send_state).toBe("delivered");
  await client.stop();
});

test("in-flight calls reject when the process exits", async () => {
  const client = new RpcClient(MOCK_CMD);
  await expect(
    client.call("send", { to: "+15551234567", text: "__crash__" }),
  ).rejects.toThrow(/exited with code 3/);
});

test("stop ends open watches cleanly", async () => {
  const client = new RpcClient(MOCK_CMD);
  const watch = await client.watch({ chat_id: 1, since_rowid: 0 });
  const consumed = (async () => {
    const texts: string[] = [];
    for await (const message of watch) texts.push(message.text);
    return texts;
  })();
  await client.stop();
  expect(await consumed).toEqual(["first", "second"]);
});
