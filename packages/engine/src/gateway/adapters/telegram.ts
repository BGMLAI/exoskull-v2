/**
 * Telegram Channel Adapter — normalizes Telegram webhook payloads
 * into InboundMessage format for the gateway router.
 */

import type { InboundMessage } from "../router";
import { getOrCreateTenant } from "@exoskull/store";

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: "private" | "group" | "supergroup" | "channel";
    };
    date: number;
    text?: string;
    voice?: { file_id: string; duration: number };
    photo?: Array<{ file_id: string; width: number; height: number }>;
  };
}

/**
 * Parse a Telegram update into an InboundMessage.
 * Returns null if the update doesn't contain a processable message.
 */
export async function parseTelegramUpdate(
  update: TelegramUpdate,
): Promise<InboundMessage | null> {
  const msg = update.message;
  if (!msg?.text) return null; // skip non-text for now
  if (msg.from.is_bot) return null; // ignore bot messages

  const telegramId = String(msg.from.id);

  // Find or create tenant by Telegram ID
  const tenant = await getOrCreateTenant(telegramId);

  return {
    tenantId: tenant.id,
    sessionId: `tg-${msg.chat.id}`, // one session per chat
    message: msg.text,
    channel: "telegram",
    metadata: {
      telegram_user_id: msg.from.id,
      telegram_chat_id: msg.chat.id,
      telegram_message_id: msg.message_id,
      telegram_username: msg.from.username,
      telegram_first_name: msg.from.first_name,
      telegram_language: msg.from.language_code,
    },
  };
}

/**
 * Send a message back to Telegram.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}
