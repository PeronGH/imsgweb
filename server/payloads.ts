/**
 * Pure transforms from imsg RPC payloads to the shapes the frontend
 * consumes. Shared by the history, chats, and SSE routes.
 */
import { attachmentUrl } from "./attachments";
import { cleanText, previewText } from "./preview";
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

/** Mimes every browser handles natively — keep the original then (e.g.
 *  animated GIF, which imsg would flatten to a single PNG frame). */
const BROWSER_NATIVE_MIME =
  /^(image\/(png|jpe?g|gif|webp|avif)|audio\/(mpeg|mp4|aac|wav|x-m4a)|video\/(mp4|webm))$/;

export function toApiMessage(message: MessagePayload): ApiMessage {
  const apiMessage: ApiMessage = {
    ...message,
    attachments: message.attachments.map((attachment) => {
      // use the ffmpeg conversion (CAF voice memo → M4A, …) only when the
      // original can't play in a browser
      const useConverted =
        attachment.converted_path !== undefined &&
        !BROWSER_NATIVE_MIME.test(attachment.mime_type);
      return {
        url: attachmentUrl(
          useConverted && attachment.converted_path !== undefined
            ? attachment.converted_path
            : attachment.filename,
        ),
        mime_type: useConverted
          ? (attachment.converted_mime_type ?? attachment.mime_type)
          : attachment.mime_type,
        transfer_name: attachment.transfer_name,
        total_bytes: attachment.total_bytes,
        is_sticker: attachment.is_sticker,
        missing: attachment.missing,
      };
    }),
  };
  // chat.db sets reply_to_guid on ordinary consecutive messages too (it's
  // Apple's send/sequence linkage) — only thread_originator_guid marks a
  // real inline reply. Without it, the joined quote misleads; drop it.
  if (apiMessage.thread_originator_guid === undefined) {
    delete apiMessage.reply_to_guid;
    delete apiMessage.reply_to_text;
    delete apiMessage.reply_to_sender;
  } else if (apiMessage.reply_to_text !== undefined) {
    // quoted parents can be attachment-only (placeholder-only text)
    const quote = cleanText(apiMessage.reply_to_text);
    apiMessage.reply_to_text = quote === "" ? "Attachment" : quote;
  }
  return apiMessage;
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
          text: previewText(lastMessage),
          sender_name: lastMessage.sender_name,
          is_from_me: lastMessage.is_from_me,
          created_at: lastMessage.created_at,
        }
      : null,
  };
}
