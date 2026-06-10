import { expect, test } from "bun:test";
import { toApiChat, toApiMessage } from "./payloads";
import type { AttachmentPayload, ChatPayload, MessagePayload } from "./rpc";

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
    filename: "/Users/x/Library/Messages/Attachments/ab/photo.heic",
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

test("toApiMessage rewrites attachments to encoded API URLs", () => {
  const message = toApiMessage(
    makeMessage([
      makeAttachment({
        filename: "/Users/x/Library/Messages/Attachments/a b/photo.heic",
      }),
    ]),
  );
  expect(message.attachments[0]?.url).toBe(
    "/api/attachments?path=%2FUsers%2Fx%2FLibrary%2FMessages%2FAttachments%2Fa%20b%2Fphoto.heic",
  );
  expect(message.attachments[0]?.mime_type).toBe("image/heic");
});

test("toApiMessage prefers the converted file and mime when present", () => {
  const message = toApiMessage(
    makeMessage([
      makeAttachment({
        converted_path:
          "/Users/x/Library/Caches/imsg/converted-attachments/voice-abc.m4a",
        converted_mime_type: "audio/mp4",
      }),
    ]),
  );
  expect(message.attachments[0]?.url).toContain(
    encodeURIComponent("converted-attachments/voice-abc.m4a"),
  );
  expect(message.attachments[0]?.mime_type).toBe("audio/mp4");
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
