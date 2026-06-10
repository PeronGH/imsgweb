/**
 * Pure transforms from imsg RPC payloads to the shapes the frontend
 * consumes. Shared by the history, chats, and SSE routes.
 */
import { attachmentUrl } from "./attachments";
import type { ChatPayload, MessagePayload } from "./rpc";

export interface ApiAttachment {
  /** Browser-cacheable URL served by GET /api/attachments/…; null when the
   *  file lives outside the known stores and cannot be served. */
  url: string | null;
  mime_type: string;
  transfer_name: string;
  total_bytes: number;
  is_sticker: boolean;
  /** Not on disk yet (e.g. pending iCloud download) — may appear later. */
  missing: boolean;
}

export type ApiMessage = Omit<MessagePayload, "attachments"> & {
  attachments: ApiAttachment[];
};

export interface ChatLastMessage {
  text: string;
  sender_name?: string;
  is_from_me: boolean;
  created_at: string;
}

export type ApiChat = ChatPayload & {
  /** Never empty — render this, not name/contact_name. */
  display_name: string;
  last_message: ChatLastMessage | null;
};

/** imsg's `name` can be "" for 1:1 chats: chat.db stores display_name as an
 *  empty string (not NULL), and the contact resolver only matches contacts
 *  it can see. Fall through to the raw handle(s). */
function chatDisplayName(chat: ChatPayload): string {
  for (const candidate of [chat.contact_name, chat.name, chat.identifier]) {
    if (candidate !== undefined && candidate.trim() !== "") return candidate;
  }
  return chat.participants.join(", ") || "Unknown";
}

export function toApiMessage(message: MessagePayload): ApiMessage {
  return {
    ...message,
    attachments: message.attachments.map((attachment) => ({
      url: attachmentUrl(attachment.converted_path ?? attachment.filename),
      mime_type: attachment.converted_mime_type ?? attachment.mime_type,
      transfer_name: attachment.transfer_name,
      total_bytes: attachment.total_bytes,
      is_sticker: attachment.is_sticker,
      missing: attachment.missing,
    })),
  };
}

export function toApiChat(
  chat: ChatPayload,
  lastMessage: MessagePayload | undefined,
): ApiChat {
  return {
    ...chat,
    display_name: chatDisplayName(chat),
    last_message: lastMessage
      ? {
          text: lastMessage.text,
          sender_name: lastMessage.sender_name,
          is_from_me: lastMessage.is_from_me,
          created_at: lastMessage.created_at,
        }
      : null,
  };
}
