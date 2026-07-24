import { env } from '@tradinjournal/config';

// Branded transactional email templates. Inline styles only (email clients
// strip <style> and external CSS), dark background with the TRADElogs green
// accent (#08C465) to match the product. Kept intentionally simple and
// table-free — a single centered card renders reliably across clients.

const BRAND = '#08C465';
const BG = '#0A0A0A';
const CARD = '#111111';
const BORDER = '#242424';
const FG = '#FFFFFF';
const MUTED = '#9A9A9A';

const SIGNUP_FOOTER = `You're receiving this because someone used this address to sign up for TRADElogs.
        If this wasn't you, you can safely ignore this email.`;

// `footer` overrides the default sign-up notice — recurring mail (the weekly
// review) has to explain why it's arriving and how to stop it, which a
// transactional OTP does not. `width` widens the card for long-form content.
function shell(inner: string, opts: { footer?: string; width?: number } = {}): string {
  const { footer = SIGNUP_FOOTER, width = 480 } = opts;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:${width}px;margin:0 auto;padding:40px 24px;">
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${FG};margin-bottom:28px;">
        TRADE<span style="color:${BRAND};">logs</span>
      </div>
      <div style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;padding:32px;">
        ${inner}
      </div>
      <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:24px 4px 0;">
        ${footer}
      </p>
    </div>
  </body>
</html>`;
}

export function verificationOtpEmail(otp: string): { subject: string; html: string } {
  const inner = `
    <h1 style="color:${FG};font-size:20px;font-weight:700;margin:0 0 12px;">Confirm your email</h1>
    <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 24px;">
      Enter this code in the app to verify your email and finish creating your account.
    </p>
    <div style="background:${BG};border:1px solid ${BORDER};border-radius:12px;padding:20px;text-align:center;margin:0 0 20px;">
      <span style="color:${BRAND};font-size:34px;font-weight:800;letter-spacing:10px;">${otp}</span>
    </div>
    <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0;">
      This code expires in 10 minutes. Don't share it with anyone.
    </p>`;
  return { subject: 'Your TRADElogs verification code', html: shell(inner) };
}

export function resetPasswordEmail(otp: string): { subject: string; html: string } {
  const inner = `
    <h1 style="color:${FG};font-size:20px;font-weight:700;margin:0 0 12px;">Reset your password</h1>
    <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 24px;">
      Enter this code in the app to set a new password. If you didn't request this, you can ignore this email — your password won't change.
    </p>
    <div style="background:${BG};border:1px solid ${BORDER};border-radius:12px;padding:20px;text-align:center;margin:0 0 20px;">
      <span style="color:${BRAND};font-size:34px;font-weight:800;letter-spacing:10px;">${otp}</span>
    </div>
    <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0;">
      This code expires in 10 minutes. Don't share it with anyone.
    </p>`;
  return { subject: 'Reset your TRADElogs password', html: shell(inner) };
}

export function welcomeEmail(name: string): { subject: string; html: string } {
  const first = name?.trim().split(' ')[0] || 'trader';
  const inner = `
    <h1 style="color:${FG};font-size:20px;font-weight:700;margin:0 0 12px;">Welcome, ${first} 👋</h1>
    <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 24px;">
      Your email is verified and your account is ready. Connect a broker to start
      syncing trades and see your edge — no manual entry needed.
    </p>
    <a href="${env.APP_URL}/dashboard"
       style="display:inline-block;background:${BRAND};color:${BG};font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">
      Open your dashboard →
    </a>`;
  return { subject: 'Welcome to TRADElogs', html: shell(inner) };
}

// ─── Weekly AI review ────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the coach's markdown review as email-safe HTML.
 *
 * The body is model-generated, so it is escaped FIRST and only then given a
 * deliberately tiny markdown vocabulary — bold, bullets, paragraphs, which is
 * all REPORT_PROMPT asks for. No raw HTML from the model can survive this, and
 * there is no parser to be surprised by.
 */
export function renderReviewHtml(markdown: string): string {
  const blocks: string[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      `<ul style="color:${MUTED};font-size:14px;line-height:1.7;margin:0 0 16px;padding-left:20px;">${bullets.join('')}</ul>`,
    );
    bullets = [];
  };

  const inline = (text: string) =>
    escapeHtml(text).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${FG};font-weight:700;">$1</strong>`);

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(`<li style="margin:0 0 6px;">${inline(bullet[1] ?? '')}</li>`);
      continue;
    }
    flushBullets();
    // Strip any leading markdown heading markers; the shape is styled by us.
    const text = line.replace(/^#{1,6}\s+/, '');
    blocks.push(`<p style="color:${MUTED};font-size:14px;line-height:1.7;margin:0 0 14px;">${inline(text)}</p>`);
  }
  flushBullets();

  return blocks.join('');
}

export interface WeeklyReviewAccountSection {
  /** Human label for the account, e.g. "EXNESS · #12345678". */
  label: string;
  /** The coach's markdown review for that account. */
  content: string;
}

export function weeklyReviewEmail(params: {
  name: string;
  weekLabel: string;
  sections: WeeklyReviewAccountSection[];
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const { name, weekLabel, sections, unsubscribeUrl } = params;
  const first = name?.trim().split(' ')[0] || 'trader';

  const body = sections
    .map(
      (s, i) => `
      <div style="${i > 0 ? `border-top:1px solid ${BORDER};margin-top:28px;padding-top:28px;` : ''}">
        <div style="color:${BRAND};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;margin:0 0 14px;">
          ${escapeHtml(s.label)}
        </div>
        ${renderReviewHtml(s.content)}
      </div>`,
    )
    .join('');

  const inner = `
    <h1 style="color:${FG};font-size:20px;font-weight:700;margin:0 0 6px;">Your week in review, ${escapeHtml(first)}</h1>
    <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0 0 4px;">${escapeHtml(weekLabel)}</p>
    ${body}
    <a href="${env.APP_URL}/dashboard"
       style="display:inline-block;background:${BRAND};color:${BG};font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;margin-top:28px;">
      Open your dashboard →
    </a>
    <p style="color:${MUTED};font-size:11px;line-height:1.6;margin:20px 0 0;">
      Generated from your own closed trades. Not financial advice.
    </p>`;

  const footer = `You're receiving this because you turned on the weekly review in TRADElogs.
        <a href="${unsubscribeUrl}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>.`;

  return {
    subject: `Your trading week in review — ${weekLabel}`,
    html: shell(inner, { footer, width: 600 }),
  };
}
