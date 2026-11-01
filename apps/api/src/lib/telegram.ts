// Telegram Bot API client (C6.2): just sendMessage. 'gone' means the chat can
// never receive from us again (the user blocked the bot or deleted the chat),
// so the caller should drop the link.
import { env } from '@tradinjournal/config';

export type TelegramResult = 'sent' | 'gone' | 'failed';
export type TelegramSend = (chatId: string, html: string) => Promise<TelegramResult>;

export function makeTelegramSend(token: string, fetchImpl: typeof fetch = fetch): TelegramSend {
  return async (chatId, html) => {
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return 'sent';
      const body = (await res.json().catch(() => null)) as { description?: string } | null;
      // 403: bot blocked or user deactivated. 400 "chat not found": the chat is gone.
      if (res.status === 403 || (res.status === 400 && /chat not found/i.test(body?.description ?? ''))) return 'gone';
      return 'failed';
    } catch {
      return 'failed';
    }
  };
}

/** The configured bot, or null when Telegram is off. */
export const telegramSend: TelegramSend | null = env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN ? makeTelegramSend(env.TELEGRAM_BOT_TOKEN) : null;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
/** Telegram's HTML mode only needs these three escaped. */
export const tgEscape = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]!);
