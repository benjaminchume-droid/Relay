/**
 * Send a sticker as a real message_type: sticker
 */
import { sendConversationMessage } from "./messagingCore";
import type { Chat, Message } from "../types";

export async function sendStickerMessage(
  chatId: string,
  sticker: { id?: string; url: string; name?: string }
): Promise<{ message: Message; chat: Chat }> {
  if (!sticker?.url) throw new Error("Sticker URL required");
  return sendConversationMessage(chatId, {
    content: sticker.name || "Sticker",
    type: "sticker",
    attachments: [
      {
        id: sticker.id || `sticker_${Date.now()}`,
        type: "image",
        url: sticker.url,
        fileName: sticker.name || "sticker.webp",
      },
    ],
  });
}
