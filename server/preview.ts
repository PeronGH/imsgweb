/**
 * Pure text helpers shared by the server payload transforms and the
 * frontend (no node imports — this module is bundled into the browser).
 */

interface PreviewAttachment {
  is_sticker: boolean;
  mime_type: string;
  converted_mime_type?: string;
  transfer_name: string;
}
interface PreviewMessage {
  text: string;
  attachments: PreviewAttachment[];
  poll?: { question?: string };
}

/** Strip attachment (U+FFFC) and app-balloon (U+FFFD) placeholders. */
export function cleanText(text: string): string {
  return text.replaceAll("￼", "").replaceAll("�", "").trim();
}

function attachmentLabel(attachment: PreviewAttachment): string {
  if (attachment.is_sticker) return "Sticker";
  const mime = attachment.converted_mime_type ?? attachment.mime_type;
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return attachment.transfer_name || "Attachment";
}

/** Human preview for a message whose text may be placeholder-only. */
export function previewText(message: PreviewMessage): string {
  const text = cleanText(message.text);
  if (text !== "") return text;
  if (message.poll) {
    return message.poll.question ? `Poll: ${message.poll.question}` : "Poll";
  }
  const attachment = message.attachments[0];
  if (attachment) return attachmentLabel(attachment);
  if (message.text.includes("￼")) return "Attachment";
  if (message.text.includes("�")) return "Interactive message";
  return "";
}
