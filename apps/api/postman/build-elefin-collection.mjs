// Generates elefin-partner.postman_collection.json (Postman v2.1): a partner's whole
// Elefin onboarding and the referral flow, end to end, against a fake Elefin
// (fake-elefin-server.ts). Run with run-elefin.sh against a disposable database.
//
//   partner signs up → applies → approved → gets their link
//   → pastes an Elefin key: wrong key, a key not allowed from our IPs, a good key
//   → traders arrive by link (cookie), by typed code, and late; they confirm their email
//   → Elefin is asked about each one by email: verified / not a client / suspended
//   → the partner, the trader and the admin all see the same answer
//   → a package unlocks; Elefin suspends and re-activates a client; the key is switched
//     off (sync pauses) and replaced; Elefin's IP allow-list changes; disconnect.
//
// Every request disables Postman's cookie jar; session cookies are sent explicitly.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const USERS = { admin: 'Ada Admin', shash: 'Shashwat Verma', asha: 'Asha Rao', ben: 'Ben Mathew', chen: 'Chen Li', dev: 'Dev Patel', eve: 'Eve Fernandes' };
const TRADERS = ['asha', 'ben', 'chen', 'dev', 'eve'];
const cookieVar = k => `${k}Cookie`;

function req(name, method, url, { body, as, cookie, tests = [], pre = [], origin = false, query, headers: extra = [] } = {}) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }, ...extra];
  if (as) headers.push({ key: 'Cookie', value: `{{${cookieVar(as)}}}` });
  else if (cookie) headers.push({ key: 'Cookie', value: cookie });
  if (origin) headers.push({ key: 'Origin', value: '{{appUrl}}' });
  const raw = url + (query ? `?${query}` : '');
  return {
    name,
    protocolProfileBehavior: { disableCookies: true, followRedirects: false },
    event: [
      ...(pre.length ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } }] : []),
      { listen: 'test', script: { type: 'text/javascript', exec: tests } },
    ],
    request: {
      method, header: headers,
      url: { raw, host: [raw.split('/')[0]], path: raw.split('?')[0].split('/').slice(1), ...(query ? { query: query.split('&').map(q => { const [k, v] = q.split('='); return { key: k, value: v }; }) } : {}) },
      ...(body !== undefined ? { body: { mode: 'raw', raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
    },
  };
}

const status = c => `pm.test('status ${c}', () => pm.response.to.have.status(${c}));`;
const code = c => `pm.test('error code ${c}', () => pm.expect(pm.response.json().error.code).to.eql('${c}'));`;
const t = (label, expr) => `pm.test(${JSON.stringify(label)}, () => { ${expr} });`;
const json = 'const d = pm.response.json().data;';
const setCookieOf = name => `(pm.response.headers.all().filter(h => h.key.toLowerCase() === 'set-cookie').map(h => h.value).find(v => v.startsWith('${name}=')) || '').split(';')[0]`;
const noSecret = t('the key’s secret is never sent back', "pm.expect(pm.response.text()).to.not.include(pm.variables.get('goodSecret')); pm.expect(pm.response.text()).to.not.include(pm.variables.get('lockedSecret'));");
// Lookups run in the background after the request that triggers them.
const settle = (ms = 2500) => [`setTimeout(() => {}, ${ms});`];

const B = '{{baseUrl}}/api';
const F = '{{fakeUrl}}/__control';
const ctl = (name, what, body) => req(`Elefin: ${name}`, 'POST', `${F}/${what}`, { body, tests: [status(200)] });

const signup = (key, extra = {}, opts = {}) => req(`Sign up ${key}`, 'POST', '{{baseUrl}}/api/auth/sign-up/email', {
  origin: true, ...opts,
  body: { email: `{{${key}Email}}`, password: '{{password}}', name: `{{${key}Name}}`, country: 'IN', city: 'Pune', postalCode: '411001', ...extra },
  tests: [status(200)],
});
const signin = key => req(`Sign in ${key}`, 'POST', '{{altUrl}}/api/auth/sign-in/email', {
  origin: true, body: { email: `{{${key}Email}}`, password: '{{password}}' },
  tests: [status(200), `const c = ${setCookieOf('better-auth.session_token')};`, t('session cookie issued', 'pm.expect(c).to.match(/^better-auth\\.session_token=/);'), `pm.collectionVariables.set('${cookieVar(key)}', c);`],
});
// Confirming the email with the code we sent signs the trader in (and fires the Elefin lookup).
const confirm = key => req(`${key} confirms their email`, 'POST', '{{altUrl}}/api/auth/email-otp/verify-email', {
  origin: true, body: { email: `{{${key}Email}}`, otp: `{{${key}Otp}}` },
  tests: [status(200), `const c = ${setCookieOf('better-auth.session_token')};`, t('signed in by confirming', 'pm.expect(c).to.match(/^better-auth\\.session_token=/);'), `pm.collectionVariables.set('${cookieVar(key)}', c);`],
});
const access = (as, label, tests, pre = []) => req(label, 'GET', `${B}/partner-access`, { as, pre, tests: [status(200), json, ...tests] });

const folders = [
  { name: '00 Sign in admin and partner', item: [signin('admin'), signin('shash')] },
  { name: '01 Bootstrap', item: [signup('admin'), signup('shash')] },

  { name: '02 Partner joins', item: [
    signin('admin'), signin('shash'),
    req('Not a partner yet: no Elefin page', 'GET', `${B}/partner/brokers/elefin`, { as: 'shash', tests: [t('refused', 'pm.expect([403, 404]).to.include(pm.response.code);')] }),
    req('Shash applies (Elefin IB)', 'POST', `${B}/partner/apply`, {
      as: 'shash',
      body: { audience: 'Telegram · 12k', brokers: ['elefin'], socials: [{ platform: 'Telegram', url: 'https://t.me/shashtrades' }], audienceSize: '12,000', pitch: 'Elefin IB, partner #23.' },
      tests: [status(201), json, t('pending with a code', "pm.expect(d.status).to.eql('PENDING'); pm.expect(d.code).to.match(/^[A-Z0-9_-]{3,20}$/);"), "pm.collectionVariables.set('shashCode', d.code); pm.collectionVariables.set('shashPid', d.id);"],
    }),
    req('Pending: can’t connect Elefin yet → 403', 'POST', `${B}/partner/brokers/elefin/test`, { as: 'shash', body: { key: '{{goodKey}}' }, tests: [status(403), code('PARTNER_PENDING')] }),
    req('Admin approves', 'POST', `${B}/admin/partners/{{shashPid}}/status`, { as: 'admin', body: { action: 'approve' }, tests: [status(200), json, t('active', "pm.expect(d.status).to.eql('ACTIVE');")] }),
    req('Shash’s link and code', 'GET', `${B}/partner/links`, { as: 'shash', tests: [status(200), json,
      t('primary code is the one from the application', "pm.expect(d.codes.find(c => c.isPrimary).code).to.eql(pm.variables.get('shashCode'));"),
      t('nothing clicked yet', 'pm.expect(d.totals).to.eql({ clicks: 0, converted: 0, signups: 0 });')] }),
  ] },

  { name: '03 Connect Elefin', item: [
    req('Not connected; the IPs to allow are listed', 'GET', `${B}/partner/brokers/elefin`, { as: 'shash', tests: [status(200), json,
      t('not connected', "pm.expect(d.state).to.eql('NOT_CONNECTED'); pm.expect(d.keyHint).to.eql(null);"),
      t('our three server IPs', "pm.expect(d.outboundIps).to.eql(['152.55.180.240', '162.220.234.242', '152.55.180.242']);"),
      t('pointed at Elefin (the fake here)', "pm.expect(d.defaultBaseUrl).to.eql(pm.variables.get('fakeUrl') + '/api/v1');")] }),
    req('Half a key → 422 before calling Elefin', 'POST', `${B}/partner/brokers/elefin/test`, { as: 'shash', body: { key: 'just-the-key-part' }, tests: [status(422)] }),
    req('Some other API address → 422', 'POST', `${B}/partner/brokers/elefin/test`, { as: 'shash', body: { key: '{{goodKey}}', baseUrl: 'https://evil.example.com/api/v1' }, tests: [status(422), code('ELEFIN_HOST')] }),
    req('A key Elefin doesn’t know → invalid_key', 'POST', `${B}/partner/brokers/elefin/test`, { as: 'shash', body: { key: 'fxcrm_pk_unknown01.fxcrm_sk_nothingtoseehere0000' }, tests: [status(200), json,
      t('invalid', "pm.expect(d.ok).to.eql(false); pm.expect(d.outcome).to.eql('invalid_key'); pm.expect(d.message).to.include('key.secret');")] }),
    req('A key not allowed from our IPs → ip_blocked, says which IPs to allow', 'POST', `${B}/partner/brokers/elefin/test`, { as: 'shash', body: { key: '{{lockedKey}}' }, tests: [status(200), json,
      t('ip_blocked', "pm.expect(d.ok).to.eql(false); pm.expect(d.outcome).to.eql('ip_blocked'); pm.expect(d.key).to.eql(null);"),
      t('says the allow-list is the problem', "pm.expect(d.message).to.include('allow-list');"),
      t('lists all three IPs to ask for', "pm.expect(d.missing).to.eql(['IP allow-list: 152.55.180.240, 162.220.234.242, 152.55.180.242']);"), noSecret] }),
    req('Saving that key saves nothing', 'POST', `${B}/partner/brokers/elefin/connect`, { as: 'shash', body: { key: '{{lockedKey}}' }, tests: [status(200), json,
      t('probe failed, still not connected', "pm.expect(d.probe.outcome).to.eql('ip_blocked'); pm.expect(d.connection.state).to.eql('NOT_CONNECTED'); pm.expect(d.sync).to.eql(null);"), noSecret] }),
    req('The real key: connect and first sync', 'POST', `${B}/partner/brokers/elefin/connect`, { as: 'shash', body: { key: '{{goodKey}}' }, tests: [status(200), json,
      t('Elefin says whose key it is', "pm.expect(d.probe.ok).to.eql(true); pm.expect(d.probe.key.partnerName).to.eql('shashwat verma'); pm.expect(d.probe.key.partnerId).to.eql(23); pm.expect(d.probe.key.keyName).to.eql('Shash IB');"),
      t('/me lists no abilities (like live Elefin) but it reads clients', 'pm.expect(d.probe.key.abilities).to.eql([]); pm.expect(d.probe.key.canReadClients).to.eql(true);'),
      t('first sync read the whole book', "pm.expect(d.sync.ok).to.eql(true); pm.expect(d.connection.state).to.eql('OK'); pm.expect(d.connection.roster.total).to.eql(pm.variables.get('bookSize') * 1);"),
      t('only the last 4 characters are shown', "pm.expect(d.connection.keyHint).to.eql('••••' + pm.variables.get('goodSecret').slice(-4));"), noSecret] }),
    req('Status after connecting', 'GET', `${B}/partner/brokers/elefin`, { as: 'shash', tests: [status(200), json,
      t('connected, synced, nobody referred yet', "pm.expect(d.state).to.eql('OK'); pm.expect(d.lastSuccessAt).to.be.a('string'); pm.expect(d.verification.referred).to.eql(0); pm.expect(d.events[0].status).to.eql('ok');"),
      t('funded and lots from Elefin', 'pm.expect(d.roster.funded).to.be.above(0); pm.expect(d.roster.lots).to.be.above(0);'), noSecret] }),
    req('Admin sees the connection', 'GET', `${B}/admin/partner-program/elefin`, { as: 'admin', tests: [status(200), json,
      "const r = d.find(x => x.partnerId === pm.variables.get('shashPid'));",
      t('connected with the book size', "pm.expect(r.state).to.eql('OK'); pm.expect(r.elefinPartner).to.eql('shashwat verma'); pm.expect(r.clients).to.eql(pm.variables.get('bookSize') * 1);"), noSecret] }),
  ] },

  { name: '04 Referral signups', item: [
    req('Eve clicks Shash’s link', 'GET', `${B}/r/{{shashCode}}`, { headers: [{ key: 'User-Agent', value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }], tests: [status(302),
      `const c = ${setCookieOf('tl_ref')};`, t('referral cookie set', 'pm.expect(c).to.match(/^tl_ref=/);'), "pm.collectionVariables.set('eveRef', c);",
      t('lands on signup', "pm.expect(pm.response.headers.get('Location')).to.include('/signup');")] }),
    signup('eve', {}, { cookie: '{{eveRef}}' }),
    signup('asha', { referralCode: '{{shashCode}}' }),
    signup('ben', { referralCode: '{{shashCode}}' }),
    signup('chen', { referralCode: '{{shashCode}}' }),
    signup('dev'),
    req('Unconfirmed emails: Elefin isn’t asked yet', 'GET', `${B}/partner/brokers/elefin`, { as: 'shash', tests: [status(200), json,
      t('4 referred, all waiting', 'pm.expect(d.verification).to.include({ referred: 4, verified: 0, held: 0, notFound: 0, waiting: 4 });')] }),
    req('No lookups have reached Elefin', 'GET', '{{fakeUrl}}/__stats', { tests: [status(200), "const s = pm.response.json();", t('no /clients/lookup', "pm.expect(Object.keys(s.byPath).filter(k => k.startsWith('/clients/lookup'))).to.eql([]);")] }),
  ] },

  { name: '05 Traders confirm their email', item: [
    ...TRADERS.map(confirm),
    access('asha', 'Asha (Elefin client, active) is verified by Elefin', [
      t('verified', "pm.expect(d.elefin.status).to.eql('VERIFIED'); pm.expect(d.elefin.held).to.eql(false); pm.expect(d.elefin.reason).to.eql(null);"),
      t('linked to Shash', "pm.expect(d.partner.name).to.eql('Shashwat Verma'); pm.expect(d.canJoin).to.eql(false);")], settle(3000)),
    access('eve', 'Eve (came by link, active) is verified', [t('verified', "pm.expect(d.elefin.status).to.eql('VERIFIED'); pm.expect(d.partner.name).to.eql('Shashwat Verma');")]),
    access('ben', 'Ben (another IB’s client at Elefin) is not found, and told why', [
      t('not found', "pm.expect(d.elefin.status).to.eql('NOT_FOUND'); pm.expect(d.elefin.held).to.eql(false);"),
      t('reason names the partner', "pm.expect(d.elefin.reason).to.include('doesn’t list your email under Shashwat'); ")]),
    access('chen', 'Chen (Shash’s client, suspended at Elefin) is held', [
      t('held', "pm.expect(d.elefin.status).to.eql('NOT_FOUND'); pm.expect(d.elefin.held).to.eql(true); pm.expect(d.elefin.reason).to.include('suspended');")]),
    access('dev', 'Dev (no link, no code) has no partner and no check', [t('nothing', 'pm.expect(d.partner).to.eql(null); pm.expect(d.canJoin).to.eql(true); pm.expect(d.elefin).to.eql(null);')]),
    req('Elefin was asked exactly four times', 'GET', '{{fakeUrl}}/__stats', { tests: [status(200), 'const s = pm.response.json();', t('4 lookups, all 200', "pm.expect(s.byPath['/clients/lookup 200']).to.eql(4);")] }),
  ] },

  { name: '06 Late code', item: [
    req('Dev types Shash’s code after signing up', 'POST', `${B}/partner-access/join`, { as: 'dev', body: { code: '{{shashCode}}' }, tests: [status(200), json, t('linked', "pm.expect(d.partner.name).to.eql('Shashwat Verma');")] }),
    access('dev', 'Dev is checked with Elefin too', [t('verified', "pm.expect(d.elefin.status).to.eql('VERIFIED');")], settle(2500)),
    req('A second code is refused', 'POST', `${B}/partner-access/join`, { as: 'dev', body: { code: '{{shashCode}}' }, tests: [status(409)] }),
  ] },

  { name: '07 Partner and admin see it', item: [
    req('Elefin page: who’s verified', 'GET', `${B}/partner/brokers/elefin`, { as: 'shash', tests: [status(200), json,
      t('5 referred: 3 verified, 1 held, 1 not found', 'pm.expect(d.verification).to.include({ referred: 5, verified: 3, held: 1, notFound: 1, waiting: 0 });'),
      t('2 of the verified have deposited', 'pm.expect(d.verification.verifiedFunded).to.eql(2);')] }),
    req('Client list', 'GET', `${B}/partner/clients`, { as: 'shash', tests: [status(200), json,
      'const rows = d.clients ?? d.items ?? d.rows ?? d; const by = n => rows.find(r => r.name.startsWith(n));',
      t('all five, with how they came', "pm.expect(rows.length).to.eql(5); pm.expect(by('Eve').via).to.eql('link'); pm.expect(by('Asha').via).to.eql('code'); pm.expect(by('Dev').via).to.eql('late');"),
      t('verified through Elefin', "for (const n of ['Asha', 'Eve', 'Dev']) pm.expect(by(n).ib.verifiedBrokers, n).to.include('elefin'); for (const n of ['Ben', 'Chen']) pm.expect(by(n).ib.verifiedBrokers, n).to.not.include('elefin');"),
      t('verified before connecting MT5; the others wait for an account', "pm.expect(by('Asha').ib.verification).to.eql('VERIFIED'); pm.expect(by('Ben').ib.verification).to.eql('NO_ACCOUNT');")] }),
    req('Link stats', 'GET', `${B}/partner/links`, { as: 'shash', tests: [status(200), json, t('1 click, converted', 'pm.expect(d.totals.clicks).to.eql(1); pm.expect(d.totals.converted).to.eql(1);')] }),
    req('Admin list', 'GET', `${B}/admin/partner-program/elefin`, { as: 'admin', tests: [status(200), json,
      "const r = d.find(x => x.partnerId === pm.variables.get('shashPid'));", t('5 referred, 3 verified', 'pm.expect(r.referred).to.eql(5); pm.expect(r.verified).to.eql(3);')] }),
    req('Admin partner view', 'GET', `${B}/admin/partners/{{shashPid}}/elefin`, { as: 'admin', tests: [status(200), json, t('same numbers', 'pm.expect(d.verification).to.include({ referred: 5, verified: 3, held: 1, notFound: 1 });'), noSecret] }),
  ] },

  { name: '08 A package unlocks for verified clients', item: [
    req('Shash publishes a package for verified Elefin clients', 'POST', `${B}/partner/packages`, { as: 'shash',
      body: { name: 'Elefin VIP', description: 'SignalX for Elefin clients', perks: ['signalx'], brokers: ['elefin'], requireActive: false, status: 'LIVE' },
      tests: [status(201), json, "pm.collectionVariables.set('pkgId', d.id);"] }),
    access('asha', 'Asha has it', [t('active', "const p = d.packages.find(x => x.name === 'Elefin VIP'); pm.expect(p.status).to.eql('ACTIVE');")], settle(1500)),
    access('ben', 'Ben doesn’t, and sees why', [t('locked with a reason', "const p = d.packages.find(x => x.name === 'Elefin VIP'); pm.expect(p.status).to.eql('LOCKED'); pm.expect(p.reasons.length).to.be.above(0);")]),
  ] },

  { name: '09 Elefin changes a client', item: [
    ctl('suspends Asha', 'status', { email: '{{ashaEmail}}', status: 'suspended' }),
    req('Sync', 'POST', `${B}/admin/partners/{{shashPid}}/elefin/sync`, { as: 'admin', tests: [status(200), json, t('ok, one less verified', 'pm.expect(d.result.ok).to.eql(true); pm.expect(d.connection.verification.verified).to.eql(2); pm.expect(d.connection.verification.held).to.eql(2);')] }),
    access('asha', 'Asha is on hold', [t('held', "pm.expect(d.elefin.held).to.eql(true); pm.expect(d.elefin.reason).to.include('suspended');")]),
    ctl('re-activates Asha', 'status', { email: '{{ashaEmail}}', status: 'active' }),
    req('Sync again', 'POST', `${B}/admin/partners/{{shashPid}}/elefin/sync`, { as: 'admin', tests: [status(200), json, t('back to 3 verified', 'pm.expect(d.connection.verification.verified).to.eql(3);')] }),
    access('asha', 'Asha is verified again', [t('verified', "pm.expect(d.elefin.status).to.eql('VERIFIED'); pm.expect(d.elefin.held).to.eql(false);")]),
  ] },

  { name: '10 Elefin switches the key off', item: [
    ctl('switches the key off', 'key-active', { key: '{{goodKeyId}}', active: false }),
    ...[1, 2].map(n => req(`Sync fails (${n})`, 'POST', `${B}/admin/partners/{{shashPid}}/elefin/sync`, { as: 'admin', tests: [status(200), json, t('error, not paused yet', "pm.expect(d.result.ok).to.eql(false); pm.expect(d.connection.state).to.eql('ERROR');")] })),
    req('Third failure pauses syncing', 'POST', `${B}/admin/partners/{{shashPid}}/elefin/sync`, { as: 'admin', tests: [status(200), json,
      t('paused, partner asked for the key again', "pm.expect(d.connection.state).to.eql('PAUSED'); pm.expect(d.connection.lastError).to.include('Add your key again');")] }),
    req('Partner can’t “Sync now” a paused key', 'POST', `${B}/partner/brokers/elefin/sync`, { as: 'shash', tests: [status(409)] }),
    access('asha', 'Traders keep what they had', [t('still verified', "pm.expect(d.elefin.status).to.eql('VERIFIED');")]),
    ctl('issues the key again', 'key-active', { key: '{{goodKeyId}}', active: true }),
    req('Shash adds the key again', 'POST', `${B}/partner/brokers/elefin/connect`, { as: 'shash', body: { key: '{{goodKey}}' }, tests: [status(200), json,
      t('working again', "pm.expect(d.probe.ok).to.eql(true); pm.expect(d.connection.state).to.eql('OK'); pm.expect(d.connection.pausedAt).to.eql(null);"), noSecret] }),
  ] },

  { name: '11 Elefin’s IP allow-list changes', item: [
    ctl('locks the key to other IPs', 'key-ips', { key: '{{goodKeyId}}', allowedIps: ['152.55.180.240', '162.220.234.242', '152.55.180.242'] }),
    req('Sync is refused; the partner is told which IPs to allow', 'POST', `${B}/admin/partners/{{shashPid}}/elefin/sync`, { as: 'admin', tests: [status(200), json,
      t('error naming the IPs', "pm.expect(d.result.ok).to.eql(false); pm.expect(d.connection.state).to.eql('ERROR'); pm.expect(d.connection.lastError).to.include('allow-list'); for (const ip of ['152.55.180.240', '162.220.234.242', '152.55.180.242']) pm.expect(d.connection.lastError).to.include(ip);"),
      t('and that the call didn’t come from one of them', "pm.expect(d.connection.lastError).to.include('Elefin saw 127.0.0.1');")] }),
    ctl('allows us again', 'key-ips', { key: '{{goodKeyId}}', allowedIps: [] }),
    req('Next sync works', 'POST', `${B}/admin/partners/{{shashPid}}/elefin/sync`, { as: 'admin', tests: [status(200), json, t('ok', "pm.expect(d.result.ok).to.eql(true); pm.expect(d.connection.state).to.eql('OK');")] }),
  ] },

  { name: '12 Disconnect', item: [
    req('Shash disconnects', 'DELETE', `${B}/partner/brokers/elefin`, { as: 'shash', tests: [status(200), json, t('not connected, nothing cached', "pm.expect(d.state).to.eql('NOT_CONNECTED'); pm.expect(d.keyHint).to.eql(null); pm.expect(d.roster).to.eql(null);")] }),
    access('asha', 'Verified traders stay verified', [t('still verified', "pm.expect(d.elefin.status).to.eql('VERIFIED');")]),
    req('Sync now → 409 (nothing connected)', 'POST', `${B}/partner/brokers/elefin/sync`, { as: 'shash', tests: [status(409)] }),
  ] },
];

const variables = {
  password: 'Str0ng-Passw0rd!', internalToken: 'partner-test-internal-token',
  ...Object.fromEntries(Object.entries(USERS).flatMap(([k, n]) => [[`${k}Name`, n], [`${k}Email`, `${k}@${k === 'admin' ? 'partners.test' : 'elefin-e2e.test'}`]])),
};
const collection = {
  info: {
    name: 'TRADElogs — Elefin partner onboarding and referrals',
    description: 'A partner’s Elefin onboarding and the referral flow end to end, against a fake Elefin. Run with run-elefin.sh.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: Object.entries(variables).map(([key, value]) => ({ key, value })),
  item: folders,
};
writeFileSync(path.join(dir, 'elefin-partner.postman_collection.json'), JSON.stringify(collection, null, 2));
console.log(`${folders.length} folders, ${folders.reduce((n, f) => n + f.item.length, 0)} requests`);
