// Product switches baked in at build time (NEXT_PUBLIC_*). The API has matching
// server-side switches; keep the two in step when flipping one.

/** Partner programme: portal, admin partner pages, referral links and codes. Off by default. */
export const PARTNERS_ENABLED = process.env.NEXT_PUBLIC_PARTNER_PROGRAM === 'true';
