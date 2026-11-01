// Telegram alerts (C6.2). Linking: Settings asks for a one-time code and opens
// t.me/<bot>?start=<code>; Telegram sends "/start <code>" to our webhook and we
// tie that chat to the user. Delivery: every notification from the last two
// hours goes to linked chats unless the user switched Telegram off for its
// group, once each, through the same delivery ledger as push and email.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@tradinjournal/config';
import { deliveryAllowed, type TelegramLinkDto, type TelegramStatusDto } from '@tradinjournal/contracts';
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { claimDelivery } from '../../lib/notifications/claim.js';
import { telegramSend, tgEscape, type TelegramSend } from '../../lib/telegram.js';

const CODE_TTL_MS = 15 * 60_000;
const MAX_AGE_MS = 2 * 3600_000;

export interface TelegramDeps {
  send: TelegramSend | null;
  botUsername: string | null;
}
const defaultDeps = (): TelegramDeps => ({ send: telegramSend, botUsername: env.TELEGRAM_ENABLED ? env.TELEGRAM_BOT_USERNAME ?? null : null });

export async function telegramStatus(userId: string, deps: TelegramDeps = defaultDeps()): Promise<TelegramStatusDto> {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  return { available: !!deps.send && !!deps.botUsername, linked: !!link, username: link?.username ?? null, linkedAt: link?.linkedAt.toISOString() ?? null };
}

/** A fresh one-time link. Older unused codes for the user stop working. */
export async function createTelegramLink(userId: string, now = new Date(), deps: TelegramDeps = defaultDeps()): Promise<TelegramLinkDto | null> {
  if (!deps.send || !deps.botUsername) return null;
  const code = randomBytes(18).toString('base64url');
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await prisma.$transaction([
    prisma.telegramLinkCode.deleteMany({ where: { userId } }),
    prisma.telegramLinkCode.create({ data: { code, userId, expiresAt } }),
  ]);
  return { url: `https://t.me/${deps.botUsername}?start=${code}`, expiresAt: expiresAt.toISOString() };
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await prisma.telegramLink.deleteMany({ where: { userId } });
}

/** Constant-time check of Telegram's X-Telegram-Bot-Api-Secret-Token header. */
export function webhookSecretOk(header: string | undefined, secret = env.TELEGRAM_WEBHOOK_SECRET): boolean {
  if (!header || !secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface TgUpdate {
  message?: { text?: string; chat?: { id?: number | string; type?: string }; from?: { username?: string } };
}

/** One webhook update. Only private chats; only /start <code>, /stop and /help do anything. */
export async function handleTelegramUpdate(update: TgUpdate, now = new Date(), deps: TelegramDeps = defaultDeps()): Promise<'linked' | 'expired' | 'stopped' | 'help' | 'ignored'> {
  const msg = update.message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
  if (!msg || !chatId || msg.chat?.type !== 'private' || typeof msg.text !== 'string') return 'ignored';
  const reply = (text: string) => deps.send?.(chatId, text).catch(() => 'failed' as const);
  const [cmd, arg] = msg.text.trim().split(/\s+/, 2);

  if (cmd === '/start' && arg) {
    const linked = await prisma.$transaction(async (tx) => {
      const row = await tx.telegramLinkCode.findUnique({ where: { code: arg } });
      if (!row) return null;
      await tx.telegramLinkCode.delete({ where: { code: arg } });
      if (row.expiresAt <= now) return null;
      // One chat per user and one user per chat: this chat moves to this user.
      await tx.telegramLink.deleteMany({ where: { OR: [{ chatId }, { userId: row.userId }] } });
      await tx.telegramLink.create({ data: { userId: row.userId, chatId, username: msg.from?.username ?? null, linkedAt: now } });
      return row.userId;
    });
    if (!linked) {
      await reply('That link has expired or was already used. In TRADElogs, open Settings › Notifications and connect Telegram again.');
      return 'expired';
    }
    await reply('<b>Connected to TRADElogs.</b> Your alerts will arrive here. Choose which ones in Settings › Notifications. Send /stop to disconnect.');
    return 'linked';
  }
  if (cmd === '/stop') {
    const { count } = await prisma.telegramLink.deleteMany({ where: { chatId } });
    await reply(count ? 'Disconnected. You won’t get TRADElogs alerts here any more.' : 'This chat isn’t connected to a TRADElogs account.');
    return 'stopped';
  }
  await reply('This bot sends your TRADElogs alerts. To connect, open TRADElogs › Settings › Notifications › Connect Telegram. Send /stop to disconnect.');
  return 'help';
}

export function telegramText(n: { title: string; body: string | null; href: string | null }): string {
  const url = `${env.APP_URL.replace(/\/$/, '')}${n.href ?? '/notifications'}`;
  return `<b>${tgEscape(n.title)}</b>${n.body ? `\n${tgEscape(n.body)}` : ''}\n<a href="${tgEscape(url).replace(/"/g, '&quot;')}">Open in TRADElogs</a>`;
}

/** Send recent notifications to linked chats. Safe to run on several instances at once. */
export async function dispatchTelegram(now = new Date(), deps: TelegramDeps = defaultDeps()): Promise<{ sent: number; dropped: number }> {
  if (!deps.send) return { sent: 0, dropped: 0 };
  const links = await prisma.telegramLink.findMany({ select: { userId: true, chatId: true, linkedAt: true } });
  if (!links.length) return { sent: 0, dropped: 0 };
  const byUser = new Map(links.map((l) => [l.userId, l]));
  const [prefs, recent] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId: { in: [...byUser.keys()] } }, select: { userId: true, groups: true } }),
    prisma.notification.findMany({
      where: { userId: { in: [...byUser.keys()] }, createdAt: { gte: new Date(now.getTime() - MAX_AGE_MS) }, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
  ]);
  const groupsOf = new Map(prefs.map((p) => [p.userId, p.groups]));
  let sent = 0;
  let dropped = 0;
  const gone = new Set<string>();
  for (const n of recent) {
    const link = byUser.get(n.userId);
    // Nothing from before the chat was linked: linking isn't a request for a backlog.
    if (!link || gone.has(link.chatId) || n.createdAt < link.linkedAt) continue;
    if (!deliveryAllowed(n.kind, 'telegram', true, groupsOf.get(n.userId))) continue;
    if (!(await claimDelivery(n.userId, `notif:${n.id}`, 'telegram'))) continue;
    const res = await deps.send(link.chatId, telegramText(n));
    if (res === 'sent') sent++;
    else if (res === 'gone') {
      gone.add(link.chatId);
      await prisma.telegramLink.deleteMany({ where: { chatId: link.chatId } });
      dropped++;
    } else logger.warn('[telegram] send failed', { kind: n.kind });
  }
  return { sent, dropped };
}
