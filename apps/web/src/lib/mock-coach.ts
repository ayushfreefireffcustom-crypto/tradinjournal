// Mock-mode AI coach threads (dev-only). Content is illustrative sample copy.
import type { AiConversationDetail } from '@/lib/api';

const ago = (m: number) => new Date(Date.now() - m * 60e3).toISOString();
const ACC = 'acc-xm-345636702';
export const SAMPLE_ANSWER = `**Holding losers.** Across your recent closed trades, losing positions stayed open noticeably longer than winners — the exits, not the entries, are where the account leaks.

- **NAS100 long, Oct 18** — held 7h 19m into the loss: **−$446.93**.
- **GBPUSD short, Oct 17** — stop moved once, closed late: **−$151.84**.

### One thing to fix
Close losing trades at your stop — don’t wait for them to come back.

_Preview mode: connect the real backend for answers grounded on your live data._`;

const g = globalThis as unknown as { __coach?: AiConversationDetail[] };
export const threads = () => (g.__coach ??= [
  { id: 'c1', title: 'Biggest leak this month', brokerAccountId: ACC, createdAt: ago(4), updatedAt: ago(2), messages: [
    { id: 'm1', role: 'user', content: 'What’s my biggest leak this month?', createdAt: ago(3) },
    { id: 'm2', role: 'assistant', content: SAMPLE_ANSWER, createdAt: ago(2) },
  ] },
  { id: 'c2', title: 'CPI week plan', brokerAccountId: ACC, createdAt: ago(200), updatedAt: ago(180), messages: [
    { id: 'm3', role: 'user', content: 'How should I approach CPI week?', createdAt: ago(181) },
    { id: 'm4', role: 'assistant', content: 'Your rule is to be **flat before high-impact data**. CPI prints at 13:30 — close or hedge index and gold positions by 13:15.', createdAt: ago(180), sources: [{ title: 'Economic calendar', url: 'https://www.forexfactory.com/calendar', snippet: '' }] },
  ] },
  { id: 'c3', title: 'Why Tuesdays bleed', brokerAccountId: ACC, createdAt: ago(60 * 30), updatedAt: ago(60 * 30), messages: [] },
  { id: 'c4', title: 'Am I cutting winners early?', brokerAccountId: ACC, createdAt: ago(60 * 52), updatedAt: ago(60 * 52), messages: [] },
  { id: 'c5', title: 'BTC position sizing', brokerAccountId: ACC, createdAt: ago(60 * 24 * 9), updatedAt: ago(60 * 24 * 9), messages: [] },
]);
