import { Resend } from 'resend';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

// A single Resend client, created only when an API key is configured. In local
// development the key is usually absent — in that case sendEmail() logs the
// message (and any OTP) to the server console instead of sending, so the full
// verification flow is testable end-to-end without a real Resend account.
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  /** optional plaintext shown in the dev-console fallback (e.g. the OTP) */
  devNote?: string;
}

export async function sendEmail({ to, subject, html, devNote }: SendArgs): Promise<void> {
  if (!resend) {
    logger.warn(
      `[email:dev] RESEND_API_KEY not set — email not sent. ${devNote ?? ''}`,
      { to, subject },
    );
    return;
  }

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    logger.error('Resend failed to send email', { to, subject, error });
    throw new Error(`Failed to send email: ${error.message}`);
  }

  logger.info('Email sent', { to, subject });
}
