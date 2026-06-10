import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { toApiChat, toApiMessage } from "./payloads";
import type { AttachmentPayload, ChatPayload, MessagePayload } from "./rpc";

const ATTACHMENTS = join(homedir(), "Library/Messages/Attachments");
const CONVERTED = join(homedir(), "Library/Caches/imsg/converted-attachments");

function makeMessage(attachments: AttachmentPayload[]): MessagePayload {
  return {
    id: 1,
    chat_id: 2,
    guid: "GUID",
    sender: "+15551234567",
    is_from_me: false,
    text: "hello",
    created_at: "2026-06-10T00:00:00.000Z",
    attachments,
    reactions: [],
    chat_identifier: "+15551234567",
    chat_guid: "iMessage;-;+15551234567",
    chat_name: "Ada",
    participants: ["+15551234567"],
    is_group: false,
  };
}

function makeAttachment(
  overrides: Partial<AttachmentPayload>,
): AttachmentPayload {
  return {
    filename: join(ATTACHMENTS, "ab/photo.heic"),
    transfer_name: "photo.heic",
    uti: "public.heic",
    mime_type: "image/heic",
    total_bytes: 1234,
    is_sticker: false,
    original_path: "~/Library/Messages/Attachments/ab/photo.heic",
    missing: false,
    ...overrides,
  };
}

test("toApiMessage rewrites attachments to store-relative URLs", () => {
  const message = toApiMessage(
    makeMessage([
      makeAttachment({ filename: join(ATTACHMENTS, "a b/photo.heic") }),
    ]),
  );
  expect(message.attachments[0]?.url).toBe(
    "/api/attachments/messages/a%20b/photo.heic",
  );
  expect(message.attachments[0]?.mime_type).toBe("image/heic");
});

test("toApiMessage prefers the converted file and mime when present", () => {
  const message = toApiMessage(
    makeMessage([
      makeAttachment({
        converted_path: join(CONVERTED, "voice-abc.m4a"),
        converted_mime_type: "audio/mp4",
      }),
    ]),
  );
  expect(message.attachments[0]?.url).toBe(
    "/api/attachments/converted/voice-abc.m4a",
  );
  expect(message.attachments[0]?.mime_type).toBe("audio/mp4");
});

test("toApiMessage keeps reply quotes only for real inline replies", () => {
  // chat.db links consecutive messages via reply_to_guid without any user
  // reply — real data showed quotes on non-replies (no thread originator)
  const falseReply = toApiMessage({
    ...makeMessage([]),
    reply_to_guid: "G-PREV",
    reply_to_text: "previous message",
    reply_to_sender: "+15551234567",
  });
  expect(falseReply.reply_to_guid).toBeUndefined();
  expect(falseReply.reply_to_text).toBeUndefined();
  expect(falseReply.reply_to_sender).toBeUndefined();

  const realReply = toApiMessage({
    ...makeMessage([]),
    reply_to_guid: "G-PREV",
    thread_originator_guid: "G-PREV",
    reply_to_text: "previous message",
    reply_to_sender: "+15551234567",
  });
  expect(realReply.reply_to_text).toBe("previous message");
});

test("conversions apply only when the browser can't play the original", () => {
  // CAF voice memo → use the M4A conversion
  const voice = toApiMessage(
    makeMessage([
      makeAttachment({
        mime_type: "audio/x-caf",
        uti: "com.apple.coreaudio-format",
        converted_path: join(CONVERTED, "voice-abc.m4a"),
        converted_mime_type: "audio/mp4",
      }),
    ]),
  ).attachments[0];
  expect(voice?.url).toBe("/api/attachments/converted/voice-abc.m4a");
  expect(voice?.mime_type).toBe("audio/mp4");

  // animated GIF plays natively — keep it over the flattened PNG frame
  const gif = toApiMessage(
    makeMessage([
      makeAttachment({
        filename: join(ATTACHMENTS, "ab/funny.gif"),
        mime_type: "image/gif",
        uti: "com.compuserve.gif",
        converted_path: join(CONVERTED, "funny-abc.png"),
        converted_mime_type: "image/png",
      }),
    ]),
  ).attachments[0];
  expect(gif?.url).toBe("/api/attachments/messages/ab/funny.gif");
  expect(gif?.mime_type).toBe("image/gif");
});

test("toApiMessage nulls the URL for files outside the stores", () => {
  const message = toApiMessage(
    makeMessage([makeAttachment({ filename: "/tmp/imsg/whatever.png" })]),
  );
  expect(message.attachments[0]?.url).toBeNull();
});

test("toApiChat falls back through name candidates for display_name", () => {
  const base: ChatPayload = {
    id: 3,
    identifier: "+15558675309",
    guid: "iMessage;-;+15558675309",
    name: "",
    service: "iMessage",
    last_message_at: "2026-06-10T00:00:00.000Z",
    participants: ["+15558675309"],
    is_group: false,
  };
  // chat.db stores display_name as "" for 1:1 chats; unresolved contacts
  // must still get a usable title
  expect(toApiChat(base, undefined).display_name).toBe("+15558675309");
  expect(
    toApiChat({ ...base, contact_name: "Jenny" }, undefined).display_name,
  ).toBe("Jenny");
  expect(toApiChat({ ...base, name: "Named" }, undefined).display_name).toBe(
    "Named",
  );
  expect(
    toApiChat(
      { ...base, identifier: "", participants: ["a@b.c", "d@e.f"] },
      undefined,
    ).display_name,
  ).toBe("a@b.c, d@e.f");
});

test("preview text labels placeholder-only messages", () => {
  const chat: ChatPayload = {
    id: 9,
    identifier: "+15551234567",
    guid: "iMessage;-;+15551234567",
    name: "Ada",
    service: "iMessage",
    last_message_at: "2026-06-10T00:00:00.000Z",
    participants: ["+15551234567"],
    is_group: false,
  };
  // attachment-only message: text is the U+FFFC placeholder (truthy!)
  const image = { ...makeMessage([makeAttachment({})]), text: "￼" };
  expect(toApiChat(chat, image).last_message?.text).toBe("Image");
  // placeholder text but attachments not fetched
  const bare = { ...makeMessage([]), text: "￼" };
  expect(toApiChat(chat, bare).last_message?.text).toBe("Attachment");
});

test("toApiMessage labels attachment-only reply quotes", () => {
  const reply = toApiMessage({
    ...makeMessage([]),
    thread_originator_guid: "G-PARENT",
    reply_to_guid: "G-PARENT",
    reply_to_text: "￼",
  });
  expect(reply.reply_to_text).toBe("Attachment");
});

test("toApiChat merges a preview and maps absence to null", () => {
  const chat: ChatPayload = {
    id: 2,
    identifier: "+15551234567",
    guid: "iMessage;-;+15551234567",
    name: "Ada",
    service: "iMessage",
    last_message_at: "2026-06-10T00:00:00.000Z",
    participants: ["+15551234567"],
    is_group: false,
  };
  expect(toApiChat(chat, makeMessage([])).last_message).toEqual({
    text: "hello",
    sender_name: undefined,
    is_from_me: false,
    created_at: "2026-06-10T00:00:00.000Z",
  });
  expect(toApiChat(chat, undefined).last_message).toBeNull();
});
