/**
 * Runnable stand-in for `imsg rpc`: NDJSON JSON-RPC 2.0 over stdio against
 * an in-memory fixture store, type-checked against ./types. Lets tests and
 * development run without the imsg binary or Full Disk Access:
 *
 *   IMSGWEB_RPC_CMD="bun server/rpc/mock.ts" bun run dev
 *
 * Behavior:
 * - chats.list, messages.history, watch.*, send, message.send_status with
 *   imsg's framing (id-less requests get no reply, errors carry `data`).
 * - watch.subscribe replays fixture rows with id > since_rowid, then live
 *   sends echo to matching subscriptions. `--interval <ms>` additionally
 *   emits a synthetic incoming message on the first chat every interval.
 * - Test triggers: subscribing to chat 999 ("Doomed") replays its rows and
 *   then kills the subscription with an error notification; sending the
 *   text "__crash__" exits 3 without responding.
 * - Exits 0 when stdin closes.
 */
import type {
  ChatPayload,
  MessagePayload,
  MessageSendStatusResult,
  RpcId,
  SendResult,
} from "./types";
import { RpcErrorCode } from "./types";

const DOOMED_CHAT_ID = 999;

function makeMessage(
  id: number,
  chat: ChatPayload,
  text: string,
  opts: { fromMe?: boolean; sender?: string; createdAt?: string } = {},
): MessagePayload {
  return {
    id,
    chat_id: chat.id,
    guid: `MOCK-${id}`,
    sender: opts.fromMe ? "" : (opts.sender ?? chat.participants[0] ?? ""),
    is_from_me: opts.fromMe ?? false,
    text,
    created_at: opts.createdAt ?? new Date().toISOString(),
    attachments: [],
    reactions: [],
    chat_identifier: chat.identifier,
    chat_guid: chat.guid,
    chat_name: chat.name,
    participants: chat.participants,
    is_group: chat.is_group,
  };
}

const chats: ChatPayload[] = [
  {
    id: 1,
    identifier: "+15551234567",
    guid: "iMessage;-;+15551234567",
    name: "Ada",
    service: "iMessage",
    last_message_at: "2026-06-10T00:00:02.000Z",
    participants: ["+15551234567"],
    is_group: false,
    contact_name: "Ada Lovelace",
  },
  {
    id: 2,
    identifier: "chat00000000000000000001",
    guid: "iMessage;+;chat00000000000000000001",
    name: "Pelican Crew",
    service: "iMessage",
    last_message_at: "2026-06-10T00:00:03.000Z",
    participants: ["+15551234567", "+15557654321"],
    is_group: true,
  },
  {
    // a 1:1 chat whose display_name is "" in chat.db and whose handle the
    // contact resolver can't match — name arrives empty (real imsg behavior)
    id: 3,
    identifier: "+15558675309",
    guid: "iMessage;-;+15558675309",
    name: "",
    service: "iMessage",
    last_message_at: "2026-06-10T00:00:04.000Z",
    participants: ["+15558675309"],
    is_group: false,
  },
  {
    id: DOOMED_CHAT_ID,
    identifier: "+15550009999",
    guid: "iMessage;-;+15550009999",
    name: "Doomed",
    service: "SMS",
    last_message_at: "2026-06-10T00:00:05.000Z",
    participants: ["+15550009999"],
    is_group: false,
  },
];

const chatById = (id: number | undefined): ChatPayload | undefined =>
  chats.find((chat) => chat.id === id);

const fixture = (id: number, chatId: number, text: string, fromMe = false) => {
  const chat = chatById(chatId);
  if (!chat) throw new Error(`fixture references unknown chat ${chatId}`);
  return makeMessage(id, chat, text, {
    fromMe,
    createdAt: `2026-06-10T00:00:0${id % 10}.000Z`,
  });
};

const messages: MessagePayload[] = [
  fixture(101, 1, "first"),
  fixture(102, 1, "second", true),
  fixture(103, 2, "hello group"),
  fixture(901, DOOMED_CHAT_ID, "doomed one"),
  fixture(902, DOOMED_CHAT_ID, "doomed two"),
];
let nextRowid = 1000;

const subscriptions = new Map<number, { chatId: number | undefined }>();
let nextSubscription = 1;

interface MockRequest {
  id?: RpcId;
  method?: string;
  params?: Record<string, unknown>;
}

const write = (value: unknown) => console.log(JSON.stringify(value));

const reply = (id: RpcId | undefined, result: unknown) => {
  if (id !== undefined) write({ jsonrpc: "2.0", id, result });
};

const replyError = (
  id: RpcId | undefined,
  code: RpcErrorCode,
  message: string,
  data?: string,
) => {
  if (id !== undefined)
    write({ jsonrpc: "2.0", id, error: { code, message, data } });
};

const num = (
  params: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = params[key];
  return typeof value === "number" ? value : undefined;
};

const str = (
  params: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
};

function notify(subscription: number, message: MessagePayload): void {
  write({
    jsonrpc: "2.0",
    method: "message",
    params: { subscription, message },
  });
}

/** Push a freshly stored message to every matching live subscription. */
function emit(message: MessagePayload): void {
  for (const [subscription, filter] of subscriptions) {
    if (filter.chatId === undefined || filter.chatId === message.chat_id) {
      notify(subscription, message);
    }
  }
}

function appendMessage(
  chat: ChatPayload,
  text: string,
  fromMe: boolean,
): MessagePayload {
  const message = makeMessage(nextRowid++, chat, text, { fromMe });
  messages.push(message);
  chat.last_message_at = message.created_at;
  emit(message);
  return message;
}

function resolveSendTarget(
  params: Record<string, unknown>,
): ChatPayload | null {
  const chatId = num(params, "chat_id");
  if (chatId !== undefined) return chatById(chatId) ?? null;
  const identifier = str(params, "chat_identifier");
  if (identifier !== undefined) {
    return chats.find((chat) => chat.identifier === identifier) ?? null;
  }
  const guid = str(params, "chat_guid");
  if (guid !== undefined)
    return chats.find((chat) => chat.guid === guid) ?? null;
  const to = str(params, "to");
  if (to !== undefined) {
    const existing = chats.find(
      (chat) =>
        chat.identifier === to ||
        (!chat.is_group && chat.participants.includes(to)),
    );
    if (existing) return existing;
    const chat: ChatPayload = {
      id: nextRowid++,
      identifier: to,
      guid: `iMessage;-;${to}`,
      name: to,
      service: "iMessage",
      last_message_at: new Date().toISOString(),
      participants: [to],
      is_group: false,
    };
    chats.push(chat);
    return chat;
  }
  return null;
}

function handle(request: MockRequest): void {
  const { id, method } = request;
  const params = request.params ?? {};
  switch (method) {
    case "chats.list": {
      const limit = num(params, "limit") ?? 20;
      const sorted = [...chats].sort((a, b) =>
        b.last_message_at.localeCompare(a.last_message_at),
      );
      reply(id, { chats: sorted.slice(0, Math.max(1, limit)) });
      return;
    }

    case "messages.history": {
      const chat = chatById(num(params, "chat_id"));
      if (!chat) {
        replyError(
          id,
          RpcErrorCode.InvalidParams,
          "Invalid params",
          "unknown chat_id",
        );
        return;
      }
      const limit = num(params, "limit") ?? 50;
      const end = str(params, "end");
      // faithful to imsg: newest-first response, `end` bound is exclusive
      const rows = messages
        .filter(
          (m) =>
            m.chat_id === chat.id && (end === undefined || m.created_at < end),
        )
        .sort((a, b) => b.id - a.id)
        .slice(0, limit);
      reply(id, { messages: rows });
      return;
    }

    case "watch.subscribe": {
      const chatId = num(params, "chat_id");
      const sinceRowid = num(params, "since_rowid");
      const subscription = nextSubscription++;
      const doomed = chatId === DOOMED_CHAT_ID;
      if (!doomed) subscriptions.set(subscription, { chatId });
      reply(id, { subscription });
      if (sinceRowid !== undefined) {
        for (const message of messages) {
          if (
            message.id > sinceRowid &&
            (chatId === undefined || message.chat_id === chatId)
          ) {
            notify(subscription, message);
          }
        }
      }
      if (doomed) {
        write({
          jsonrpc: "2.0",
          method: "error",
          params: { subscription, error: { message: "stream died" } },
        });
      }
      return;
    }

    case "watch.unsubscribe": {
      subscriptions.delete(num(params, "subscription") ?? -1);
      reply(id, { ok: true });
      return;
    }

    case "send": {
      const text = str(params, "text") ?? "";
      if (text === "__crash__") process.exit(3);
      const chat = resolveSendTarget(params);
      if (!chat) {
        replyError(
          id,
          RpcErrorCode.InvalidParams,
          "Invalid params",
          "unknown chat_id",
        );
        return;
      }
      const message = appendMessage(chat, text, true);
      const result: SendResult = {
        ok: true,
        transport: "applescript",
        id: message.id,
        guid: message.guid,
        message_id: message.guid,
        chat_guid: chat.guid,
        service: chat.service,
      };
      reply(id, result);
      return;
    }

    case "message.send_status": {
      const guid = str(params, "guid") ?? "";
      const sent = messages.find((m) => m.guid === guid && m.is_from_me);
      const checkedAt = new Date().toISOString();
      const result: MessageSendStatusResult = sent
        ? {
            ok: true,
            guid,
            send_state: "delivered",
            service: "iMessage",
            checked_at: checkedAt,
            delivered_at: sent.created_at,
            status_fields: {
              is_sent: true,
              is_delivered: true,
              is_finished: true,
              error: 0,
              date_delivered: sent.created_at,
              date_read: null,
              is_delayed: false,
              is_prepared: false,
              is_pending_satellite_send: false,
              was_downgraded: false,
            },
          }
        : {
            ok: true,
            guid,
            send_state: "pending",
            service: null,
            checked_at: checkedAt,
            status_fields: null,
          };
      reply(id, result);
      return;
    }

    default:
      replyError(
        id,
        RpcErrorCode.MethodNotFound,
        "Method not found",
        `unknown method ${method ?? "(none)"}`,
      );
  }
}

const intervalIndex = process.argv.indexOf("--interval");
const intervalMs =
  intervalIndex === -1 ? 0 : Number(process.argv[intervalIndex + 1] ?? "");
let syntheticCount = 0;
if (intervalMs > 0) {
  setInterval(() => {
    const chat = chats[0];
    if (chat)
      appendMessage(chat, `synthetic message ${++syntheticCount}`, false);
  }, intervalMs);
}

for await (const line of console) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  let request: MockRequest;
  try {
    request = JSON.parse(trimmed) as MockRequest;
  } catch {
    write({
      jsonrpc: "2.0",
      id: null,
      error: { code: RpcErrorCode.ParseError, message: "Parse error" },
    });
    continue;
  }
  handle(request);
}
process.exit(0);
