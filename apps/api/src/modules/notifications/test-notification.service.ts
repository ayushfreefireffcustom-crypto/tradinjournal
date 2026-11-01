// "Send a test" (QW.15): one push to each device the user turned push on for,
// and one Telegram message if they linked a chat. The result says what each
// channel did, so the page can be honest about it; whether this particular
// device showed it is something only the browser can tell.
import { prisma } from '@tradinjournal/db';
import { isPushEnabled, sendPush, type PushPayload, type PushResult, type PushTarget } from '../../lib/push.js';
import { telegramSend, type TelegramSend } from '../../lib/telegram.js';

export interface TestDeps {
  sendPush: (t: PushTarget, p: PushPayload) => Promise<PushResult>;
  pushEnabled: () => boolean;
  telegram: TelegramSend | null;
}
const defaultDeps = (): TestDeps => ({ sendPush, pushEnabled: isPushEnabled, telegram: telegramSend });

export interface TestResult {
  push: { available: boolean; devices: number; sent: number; failed: number; removed: number };
  telegram: 'sent' | 'failed' | 'not_linked' | 'off';
}

export async function sendTestNotification(userId: string, deps: TestDeps = defaultDeps()): Promise<TestResult> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const push = { available: deps.pushEnabled(), devices: subs.length, sent: 0, failed: 0, removed: 0 };
  if (push.available) {
    for (const s of subs) {
      const r = await deps.sendPush(s, { title: 'Test notification', body: 'If you can see this, push notifications work on this device.', url: '/settings#notifications', test: true });
      if (r === 'sent') push.sent++;
      else if (r === 'gone') {
        // The browser dropped this subscription; it can never receive again.
        await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
        push.removed++;
      } else push.failed++;
    }
  }
  let telegram: TestResult['telegram'] = 'off';
  if (deps.telegram) {
    const link = await prisma.telegramLink.findUnique({ where: { userId } });
    if (!link) telegram = 'not_linked';
    else {
      const r = await deps.telegram(link.chatId, '<b>Test notification</b>\nIf you can read this, TRADElogs alerts reach this chat.');
      telegram = r === 'sent' ? 'sent' : 'failed';
    }
  }
  return { push, telegram };
}
