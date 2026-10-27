'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AuthShell, { AuthSubmit, EyeButton, PasswordStrength } from '@/components/v3/auth-shell';
import GoogleButton from '@/components/google-button';
import { authClient } from '@/lib/auth-client';
import { useRedirectIfAuthed } from '@/lib/use-redirect-if-authed';
import { COUNTRIES } from '@/lib/countries';
import { partnerApi } from '@/lib/partner-api';

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const bucket = Math.min(4, score);
  const labels = ['Weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const colors = ['#FE3A31', '#FE3A31', '#FF9F0A', '#08C465', '#08C465'];
  return { score: bucket, label: labels[bucket]!, color: colors[bucket]! };
}

export default function SignupPage() {
  const router = useRouter();
  useRedirectIfAuthed();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Referral: pre-filled from /signup?ref=CODE (the partner link redirect) or typed.
  const [refOpen, setRefOpen] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [refCheck, setRefCheck] = useState<{ code: string; valid: boolean; partnerName: string | null } | null>(null);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[A-Za-z0-9_-]{3,20}$/.test(ref)) { setRefCode(ref.toUpperCase()); setRefOpen(true); }
  }, []);
  useEffect(() => {
    const code = refCode.trim();
    if (code.length < 3) { setRefCheck(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      partnerApi.checkCode(code).then(r => { if (alive) setRefCheck({ code, ...r }); }).catch(() => { if (alive) setRefCheck(null); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [refCode]);
  const refValid = !!refCheck && refCheck.code === refCode.trim() && refCheck.valid;

  const strength = useMemo(() => passwordStrength(password), [password]);
  const canSubmit =
    name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    strength.score >= 2 &&
    agree &&
    country.length === 2 &&
    city.trim().length > 0 &&
    postalCode.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    const addr = email.trim().toLowerCase();
    try {
      const res = await authClient.signUp.email({
        email: addr,
        password,
        name: name.trim(),
        country: country.toUpperCase(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        // Only a recognised code is sent; an unknown one is simply ignored.
        ...(refValid ? { referralCode: refCode.trim() } : {}),
      });
      if (res?.error) throw new Error(res.error.message ?? 'Could not create account');
      router.push(`/verify?email=${encodeURIComponent(addr)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
      setLoading(false);
    }
  }

  const ok = (v: boolean) => v && <svg className="ok-i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  const nameOk = name.trim().length > 1, emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const flagOf = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '');
  return (
    <AuthShell variant="signup" testId="signup-page" top={<>Already journaling? <Link href="/login" data-testid="signup-to-login">Sign in</Link></>}>
      <form onSubmit={submit} data-testid="signup-form">
        <h1 className="au-h"><b>Create your</b> <em>account.</em></h1>
        <p className="au-sub">Free · up to 2 MT5 accounts · no card.</p>
        <div style={{ marginTop: 26 }}><GoogleButton label="Sign up with Google" /></div>
        <div className="au-or">or with email</div>
        <div className="au-fields">
          <div className="au-row2">
            <label><span className="au-lbl">Full name</span>
              <span className={`au-in ${nameOk ? 'ok' : ''}`}><input type="text" required value={name} onChange={e => setName(e.target.value)} data-testid="signup-name" placeholder="Alex Morgan" autoComplete="name" />{ok(nameOk)}</span>
            </label>
            <label><span className="au-lbl">Email</span>
              <span className={`au-in ${emailOk ? 'ok' : ''}`}><input type="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="signup-email" placeholder="you@example.com" autoComplete="email" />{ok(emailOk)}</span>
            </label>
          </div>
          <div>
            <label className="au-lbl" htmlFor="su-pw">Password</label>
            <span className="au-in">
              <input id="su-pw" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} data-testid="signup-password" placeholder="At least 8 characters" autoComplete="new-password" />
              <EyeButton shown={showPassword} onClick={() => setShowPassword(s => !s)} testId="toggle-password" />
            </span>
            {password && <PasswordStrength score={strength.score} label={strength.label} />}
          </div>
          <label><span className="au-lbl">Country</span>
            <span className="au-in">
              {country && <span style={{ position: 'absolute', left: 16, fontSize: 20, pointerEvents: 'none' }} aria-hidden>{flagOf(country)}</span>}
              <select required value={country} onChange={e => setCountry(e.target.value)} data-testid="signup-country" style={country ? { paddingLeft: 48 } : undefined}>
                <option value="">Select country…</option>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
              <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </label>
          <div className="au-row2">
            <label><span className="au-lbl">City</span><span className="au-in"><input type="text" required value={city} onChange={e => setCity(e.target.value)} data-testid="signup-city" placeholder="e.g. Raipur" autoComplete="address-level2" /></span></label>
            <label><span className="au-lbl">Postal / ZIP / PIN</span><span className="au-in"><input type="text" required value={postalCode} onChange={e => setPostalCode(e.target.value)} data-testid="signup-postal" placeholder="e.g. 492001" autoComplete="postal-code" /></span></label>
          </div>
          <div className="au-ref" data-testid="signup-referral">
            {!refOpen ? (
              <button type="button" className="au-ref-toggle" onClick={() => setRefOpen(true)}>Have a referral code?</button>
            ) : <>
              <label className="au-lbl" htmlFor="su-ref">Referral code <span className="au-lbl-opt">optional</span></label>
              <span className={`au-in ${refValid ? 'ok' : ''}`}>
                <input id="su-ref" type="text" value={refCode} maxLength={20} onChange={e => setRefCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())} placeholder="e.g. ROHANFX" autoComplete="off" data-testid="signup-ref" />{ok(refValid)}
              </span>
              {refValid && refCheck?.partnerName && (
                <p className="au-ref-note" data-testid="signup-ref-ok"><b>Referred by {refCheck.partnerName}.</b> They&rsquo;ll see your name, city and how actively you trade — never your email, balance or trades.</p>
              )}
              {refCheck && refCheck.code === refCode.trim() && !refCheck.valid && (
                <p className="au-ref-note bad" data-testid="signup-ref-bad">We don&rsquo;t recognise that code. You can still sign up — it just won&rsquo;t be linked to anyone.</p>
              )}
            </>}
          </div>
          <label className="au-check">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} data-testid="agree-toggle" />
            <span className="box"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <span>I agree to the <Link href="/terms" target="_blank">Terms</Link> and <Link href="/privacy" target="_blank">Privacy policy</Link>. TRADElogs is a journal, not investment advice — we only use your read-only MT5 login.</span>
          </label>
          {error && <div className="au-err" data-testid="signup-error" role="alert">{error}</div>}
          <AuthSubmit loading={loading} disabled={!canSubmit} testId="signup-submit">{loading ? 'Creating account…' : 'Create account'}</AuthSubmit>
        </div>
      </form>
    </AuthShell>
  );
}
