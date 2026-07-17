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

function shell(inner: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${FG};margin-bottom:28px;">
        TRADE<span style="color:${BRAND};">logs</span>
      </div>
      <div style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;padding:32px;">
        ${inner}
      </div>
      <p style="color:${MUTED};font-size:12px;line-height:1.6;margin:24px 4px 0;">
        You're receiving this because someone used this address to sign up for TRADElogs.
        If this wasn't you, you can safely ignore this email.
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
