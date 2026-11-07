// Generates ib-partner.postman_collection.json (Postman v2.1): the IB partner flow from
// the boss's doc, end to end. Run with run-ib.sh against a disposable database.
// Every request disables Postman's cookie jar; session cookies are sent explicitly.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const USERS = { admin: 'Ada Admin', honey: 'Honey Kapoor', t1: 'Tara Shah', t2: 'Vikram Das', t3: 'Leena Joshi', t4: 'Omar Sheikh' };
const cookieVar = k => `${k}Cookie`;

function req(name, method, url, { body, as, tests = [], pre = [], origin = false, query } = {}) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  if (as) headers.push({ key: 'Cookie', value: `{{${cookieVar(as)}}}` });
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
const acc = login => `const a = d.accounts.find(x => x.label.startsWith('${login}'));`;

const signup = (key, extra = {}) => req(`Sign up ${key}`, 'POST', '{{baseUrl}}/api/auth/sign-up/email', {
  origin: true,
  body: { email: `{{${key}Email}}`, password: '{{password}}', name: `{{${key}Name}}`, country: 'IN', city: 'Pune', postalCode: '411001', ...extra },
  tests: [status(200)],
});
const signin = key => req(`Sign in ${key}`, 'POST', '{{altUrl}}/api/auth/sign-in/email', {
  origin: true, body: { email: `{{${key}Email}}`, password: '{{password}}' },
  tests: [status(200), `const c = ${setCookieOf('better-auth.session_token')};`, t('session cookie issued', 'pm.expect(c).to.match(/^better-auth\\.session_token=/);'), `pm.collectionVariables.set('${cookieVar(key)}', c);`],
});
const connect = (as, login, server) => req(`${as} connects MT5 ${login} (${server})`, 'POST', `${B}/accounts`, {
  as, body: { mt5Login: login, password: 'demo-pass', server },
  tests: [status(201), json, `pm.collectionVariables.set('${as}Acc', d.id);`],
});
const verify = (as, extra = {}) => req(`${as} checks their account`, 'POST', `${B}/partner-access/verify`, {
  as, body: { brokerAccountId: `{{${as}Acc}}`, ...extra }, tests: [status(200), json],
});

const B = '{{baseUrl}}/api';
const I = '{{baseUrl}}/internal/partners';
const internal = { key: 'X-Internal-Token', value: '{{internalToken}}' };

const folders = [
  { name: '00 Sign in all', item: Object.keys(USERS).map(signin) },
  { name: '01 Bootstrap users', item: [signup('admin'), signup('honey'), signup('t4')] },

  { name: '02 Partner application', item: [
    signin('admin'), signin('honey'), signin('t4'),
    req('Application needs a valid social URL', 'POST', `${B}/partner/apply`, { as: 'honey', body: { audience: 'YouTube · 40k', socials: [{ platform: 'YouTube', url: 'not a url' }] }, tests: [status(422)] }),
    req('Honey applies with brokers, socials and a pitch', 'POST', `${B}/partner/apply`, {
      as: 'honey',
      body: { audience: 'YouTube · 40k subscribers', brokers: ['xellion'], socials: [{ platform: 'YouTube', url: 'https://youtube.com/@honeytrades' }, { platform: 'Telegram', url: 'https://t.me/honeytrades' }], audienceSize: '40,000', pitch: 'Forex education for beginners; IB at Xellion.' },
      tests: [status(201), json, t('pending with a code', "pm.expect(d.status).to.eql('PENDING'); pm.expect(d.code).to.match(/^[A-Z0-9_-]{3,20}$/);"), "pm.collectionVariables.set('honeyCode', d.code); pm.collectionVariables.set('honeyPid', d.id);"],
    }),
    req('Pending partner portal → 403 PARTNER_PENDING', 'GET', `${B}/partner/overview`, { as: 'honey', tests: [status(403), code('PARTNER_PENDING')] }),
    req('Asking for info needs a reason → 409', 'POST', `${B}/admin/partners/{{honeyPid}}/status`, { as: 'admin', body: { action: 'request_info' }, tests: [status(409)] }),
    req('Admin asks for more info', 'POST', `${B}/admin/partners/{{honeyPid}}/status`, { as: 'admin', body: { action: 'request_info', reason: 'Send your Xellion IB id' }, tests: [status(200), json, t('needs info', "pm.expect(d.status).to.eql('NEEDS_INFO');")] }),
    req('Applicant sees what to add', 'GET', `${B}/partner/overview`, { as: 'honey', tests: [status(403), code('PARTNER_NEEDS_INFO'), t('message carries the note', "pm.expect(pm.response.json().error.message).to.include('Xellion IB id');")] }),
    req('/me shows the review note', 'GET', `${B}/partner/me`, { as: 'honey', tests: [status(200), json, t('reviewNote', "pm.expect(d.status).to.eql('NEEDS_INFO'); pm.expect(d.reviewNote).to.eql('Send your Xellion IB id');")] }),
    req('Honey answers by re-applying', 'POST', `${B}/partner/apply`, { as: 'honey', body: { audience: 'YouTube · 40k subscribers', brokers: ['xellion'], pitch: 'Xellion IB id XL-4471.' }, tests: [status(201), json, t('back to pending', "pm.expect(d.status).to.eql('PENDING');")] }),
    req('Admin approves', 'POST', `${B}/admin/partners/{{honeyPid}}/status`, { as: 'admin', body: { action: 'approve' }, tests: [status(200), json, t('active', "pm.expect(d.status).to.eql('ACTIVE');")] }),
    req('Admin detail shows the application', 'GET', `${B}/admin/partners/{{honeyPid}}`, { as: 'admin', tests: [status(200), json,
      t('application fields', "pm.expect(d.application.brokers).to.eql(['xellion']); pm.expect(d.application.pitch).to.include('XL-4471'); pm.expect(d.application.reviewNote).to.eql(null);"),
      t('event trail', "pm.expect(d.events.map(e => e.kind)).to.include.members(['partner.request_info', 'partner.approve']);")] }),
  ] },

  { name: '03 Broker IB connection', item: [
    req('Catalog lists the brokers', 'GET', `${B}/partner/brokers`, { as: 'honey', tests: [status(200), json, t('xellion + other, all methods', "const x = d.catalog.find(c => c.key === 'xellion'); pm.expect(x.methods).to.eql(['LIST','SHEET','API']); pm.expect(d.catalog.map(c => c.key)).to.include('other'); pm.expect(d.brokers).to.eql([]);")] }),
    req('API method: connection waits for its API setup', 'POST', `${B}/partner/brokers`, { as: 'honey', body: { broker: 'elefin', method: 'API', apiKey: 'live-key-123456' },
      tests: [status(201), json, t('pending, key stored', "pm.expect(d.method).to.eql('API'); pm.expect(d.status).to.eql('PENDING'); pm.expect(d.hasApiKey).to.eql(true);"), "pm.collectionVariables.set('elefinId', d.id);"] }),
    req('Remove it again', 'DELETE', `${B}/partner/brokers/{{elefinId}}`, { as: 'honey', tests: [status(204)] }),
    req('Sheet must be a Google Sheets link → 422', 'POST', `${B}/partner/brokers`, { as: 'honey', body: { broker: 'xellion', method: 'SHEET', sheetUrl: 'https://example.com/list.csv' }, tests: [status(422)] }),
    req('Other broker needs a server match → 422', 'POST', `${B}/partner/brokers`, { as: 'honey', body: { broker: 'other', method: 'LIST' }, tests: [status(422)] }),
    req('Unknown broker → 422', 'POST', `${B}/partner/brokers`, { as: 'honey', body: { broker: 'mystery', method: 'LIST' }, tests: [status(422)] }),
    req('Connect Xellion (list upload)', 'POST', `${B}/partner/brokers`, { as: 'honey', body: { broker: 'xellion', method: 'LIST', ibId: 'XL-4471' },
      tests: [status(201), json, t('pending, no accounts', "pm.expect(d.status).to.eql('PENDING'); pm.expect(d.accountCount).to.eql(0); pm.expect(d.hasApiKey).to.eql(false);"), "pm.collectionVariables.set('xlId', d.id);"] }),
    req('Empty list → 422', 'POST', `${B}/partner/brokers/{{xlId}}/accounts`, { as: 'honey', body: { text: 'name\nnobody\n' }, tests: [status(422)] }),
    req('Upload the referred-accounts CSV', 'POST', `${B}/partner/brokers/{{xlId}}/accounts`, { as: 'honey',
      body: { text: 'Account ID,Email\n7001001,tara@broker.test\n7001003,\n7009999,vikram.broker@mail.test\nbad row,\n', mode: 'replace' },
      tests: [status(200), json, t('3 added, 1 skipped', "pm.expect([d.added, d.updated, d.removed, d.skipped]).to.eql([3,0,0,1]); pm.expect(d.broker.status).to.eql('OK'); pm.expect(d.broker.accountCount).to.eql(3);")] }),
    req('Re-upload with one gone (replace)', 'POST', `${B}/partner/brokers/{{xlId}}/accounts`, { as: 'honey',
      body: { text: '7001001,tara@broker.test\n7009999,vikram.broker@mail.test\n7001004\n', mode: 'replace' },
      tests: [status(200), json, t('+1, −1', "pm.expect(d.added).to.eql(1); pm.expect(d.removed).to.eql(1); pm.expect(d.broker.accountCount).to.eql(3);")] }),
  ] },

  { name: '04 Referred signups', item: [
    signup('t1', { referralCode: '{{honeyCode}}' }), signup('t2', { referralCode: '{{honeyCode}}' }), signup('t3', { referralCode: '{{honeyCode}}' }),
  ] },

  { name: '05 Client verification', item: [
    req('Before connecting: partner shown, nothing to verify', 'GET', `${B}/partner-access`, { as: 't1', tests: [status(200), json,
      t('partner is Honey', "pm.expect(d.partner.name).to.eql(pm.variables.get('honeyName')); pm.expect(d.partner.status).to.eql('ACTIVE'); pm.expect(d.canJoin).to.eql(false);"),
      t('no accounts, no packages', 'pm.expect(d.accounts).to.eql([]); pm.expect(d.packages).to.eql([]);')] }),
    connect('t1', 7001001, 'Xellion-Live'),
    verify('t1'),
    "x",
    connect('t2', 7001002, 'Xellion-Live'),
    verify('t2'),
    connect('t3', 8001001, 'Exness-MT5Real8'),
    verify('t3'),
  ].filter(x => x !== 'x') },
];

// Assertions for the verification results (kept apart for readability).
const f5 = folders.find(f => f.name.startsWith('05')).item;
f5.find(r => r.name === 't1 checks their account').event[0].script.exec.push(
  acc('7001001'), t('t1 verified by account number', "pm.expect(a.status).to.eql('VERIFIED'); pm.expect(a.brokerKey).to.eql('xellion'); pm.expect(a.reason).to.eql(null); pm.expect(a.canRetry).to.eql(false);"));
f5.find(r => r.name === 't2 checks their account').event[0].script.exec.push(
  acc('7001002'), t('t2 not in the list, with a reason and a retry', "pm.expect(a.status).to.eql('NOT_FOUND'); pm.expect(a.reason).to.include('isn’t in'); pm.expect(a.canRetry).to.eql(true);"));
f5.find(r => r.name === 't3 checks their account').event[0].script.exec.push(
  acc('8001001'), t('t3 at a broker Honey has not connected', "pm.expect(a.status).to.eql('UNSUPPORTED_BROKER'); pm.expect(a.brokerKey).to.eql('exness'); pm.expect(a.reason).to.include('Exness');"));
f5.push(
  req('t2 gives the broker email → review, not verified', 'POST', `${B}/partner-access/verify`, { as: 't2', body: { brokerAccountId: '{{t2Acc}}', brokerEmail: 'vikram.broker@mail.test' },
    tests: [status(200), json, acc('7001002'), t('email match goes to review', "pm.expect(a.status).to.eql('MANUAL_REVIEW'); pm.expect(a.brokerEmail).to.eql('vikram.broker@mail.test');")] }),
  req('t3 asks for a review', 'POST', `${B}/partner-access/review`, { as: 't3', body: { brokerAccountId: '{{t3Acc}}', note: 'Opened last week' },
    tests: [status(200), json, acc('8001001'), t('still unsupported, review recorded', "pm.expect(a.status).to.eql('UNSUPPORTED_BROKER'); pm.expect(a.reviewRequested).to.eql(true);")] }),
  req('Someone else’s account → 404', 'POST', `${B}/partner-access/verify`, { as: 't3', body: { brokerAccountId: '{{t1Acc}}' }, tests: [status(404)] }),
  req('Partner sees the broker health', 'GET', `${B}/partner/brokers`, { as: 'honey', tests: [status(200), json, t('3 client accounts, 1 verified', "const x = d.brokers[0]; pm.expect(x.clientAccounts).to.eql(2); pm.expect(x.verified).to.eql(1);")] }),
);

folders.push(
  { name: '06 Packages and access', item: [
    req('Package needs content → 422', 'POST', `${B}/partner/packages`, { as: 'honey', body: { name: 'Empty', perks: [], status: 'LIVE' }, tests: [status(422)] }),
    req('Unknown feature → 422', 'POST', `${B}/partner/packages`, { as: 'honey', body: { name: 'Bad', perks: ['teleport'], status: 'LIVE' }, tests: [status(422)] }),
    req('Someone else’s template → 422', 'POST', `${B}/partner/packages`, { as: 'honey', body: { name: 'Steal', templateIds: ['nope123'], status: 'LIVE' }, tests: [status(422)] }),
    req('Honey publishes "Starter" (SignalX, no activity rule)', 'POST', `${B}/partner/packages`, { as: 'honey',
      body: { name: 'Starter', description: 'SignalX for verified clients', perks: ['signalx'], requireActive: false, status: 'LIVE' },
      tests: [status(201), json, t('live with 1 holder', "pm.expect(d.status).to.eql('LIVE'); pm.expect(d.holders).to.eql(1);"), "pm.collectionVariables.set('pkgStarter', d.id);"] }),
    req('Honey drafts "Pro" (needs active trading, 30 days)', 'POST', `${B}/partner/packages`, { as: 'honey',
      body: { name: 'Pro', perks: ['options', 'macro'], requireActive: true, accessDays: 30, status: 'DRAFT' },
      tests: [status(201), json, t('draft, no holders', "pm.expect(d.status).to.eql('DRAFT'); pm.expect(d.holders).to.eql(0);"), "pm.collectionVariables.set('pkgPro', d.id);"] }),
    req('Packages page lists perks and brokers', 'GET', `${B}/partner/packages`, { as: 'honey', tests: [status(200), json, t('2 packages, perk catalog, xellion', "pm.expect(d.packages.length).to.eql(2); pm.expect(d.perks.map(p => p.key)).to.include('signalx'); pm.expect(d.brokers).to.eql([{ key: 'xellion', label: 'Xellion' }]);")] }),
    req('t1 holds Starter', 'GET', `${B}/partner-access`, { as: 't1', tests: [status(200), json, t('Starter active, Pro not listed (draft)', "const s = d.packages.find(p => p.name === 'Starter'); pm.expect(s.status).to.eql('ACTIVE'); pm.expect(s.perks[0].key).to.eql('signalx'); pm.expect(d.packages.some(p => p.name === 'Pro')).to.eql(false);")] }),
    req('t2 sees why Starter is locked', 'GET', `${B}/partner-access`, { as: 't2', tests: [status(200), json, t('locked with the reason', "const s = d.packages.find(p => p.name === 'Starter'); pm.expect(s.status).to.eql('LOCKED'); pm.expect(s.reasons.join(' ')).to.include('Verify a broker account');")] }),
    req('Honey goes live with Pro', 'PATCH', `${B}/partner/packages/{{pkgPro}}`, { as: 'honey', body: { status: 'LIVE' }, tests: [status(200), json, t('live, nobody active yet', "pm.expect(d.status).to.eql('LIVE'); pm.expect(d.holders).to.eql(0);")] }),
    req('t1 sees the activity rule on Pro', 'GET', `${B}/partner-access`, { as: 't1', tests: [status(200), json, t('Pro locked until they trade', "const p = d.packages.find(x => x.name === 'Pro'); pm.expect(p.status).to.eql('LOCKED'); pm.expect(p.reasons.join(' ')).to.include('Trade at least 1 closed trade in the last 30 days');")] }),
  ] },

  { name: '07 Feature locks', item: [
    req('Non-admin cannot change settings', 'PUT', `${B}/admin/partner-program/settings`, { as: 'honey', body: { activeMinTrades: 1, activeWindowDays: 30, activeMinLots: 0, graceDays: 7, partnerGraceDays: 7, lockedPerks: [] }, tests: [status(403)] }),
    req('Default settings', 'GET', `${B}/admin/partner-program/settings`, { as: 'admin', tests: [status(200), json, t('nothing locked, 1 trade / 30 days', "pm.expect(d).to.eql({ activeMinTrades: 1, activeWindowDays: 30, activeMinLots: 0, graceDays: 7, partnerGraceDays: 7, lockedPerks: [], ibApiHosts: [] });")] }),
    req('With nothing locked SignalX is open to t2', 'GET', `${B}/trader/strategies`, { as: 't2', tests: [t('not perk-locked', "pm.expect(pm.response.code).to.not.eql(403);")] }),
    req('Admin locks SignalX to package holders', 'PUT', `${B}/admin/partner-program/settings`, { as: 'admin', body: { activeMinTrades: 1, activeWindowDays: 30, activeMinLots: 0, graceDays: 7, partnerGraceDays: 3, lockedPerks: ['signalx', 'not-a-perk'] },
      tests: [status(200), json, t('unknown perks dropped', "pm.expect(d.lockedPerks).to.eql(['signalx']); pm.expect(d.partnerGraceDays).to.eql(3);")] }),
    req('t2 (no package) → 403 PERK_LOCKED', 'GET', `${B}/trader/strategies`, { as: 't2', tests: [status(403), code('PERK_LOCKED')] }),
    req('t1 (holds Starter) gets through', 'GET', `${B}/trader/strategies`, { as: 't1', tests: [t('not perk-locked', "pm.expect(pm.response.code).to.not.eql(403);")] }),
    req('Honey (active partner) gets through', 'GET', `${B}/trader/strategies`, { as: 'honey', tests: [t('not perk-locked', "pm.expect(pm.response.code).to.not.eql(403);")] }),
    req('Admin gets through', 'GET', `${B}/trader/strategies`, { as: 'admin', tests: [t('not perk-locked', "pm.expect(pm.response.code).to.not.eql(403);")] }),
    req('t2 access page lists the lock', 'GET', `${B}/partner-access`, { as: 't2', tests: [status(200), json, t('locked and not mine', "pm.expect(d.lockedPerks).to.eql(['signalx']); pm.expect(d.myPerks).to.not.include('signalx'); pm.expect(d.myPerks).to.include('options');")] }),
  ] },

  { name: '08 Admin review', item: [
    req('Review queue has t2 (email signal)', 'GET', `${B}/admin/partner-program/reviews`, { as: 'admin', tests: [status(200), json,
      "const v = d.find(x => x.kind === 'verification' && x.account && x.account.login === '7001002');",
      t('t2 in review with the email signal', "pm.expect(v.signal).to.eql('email-match'); pm.expect(v.brokerEmail).to.eql('vikram.broker@mail.test'); pm.expect(v.partner.name).to.eql(pm.variables.get('honeyName'));"),
      "pm.collectionVariables.set('t2Verif', v.id);"] }),
    req('Non-admin cannot see the queue', 'GET', `${B}/admin/partner-program/reviews`, { as: 'honey', tests: [status(403)] }),
    req('Admin approves t2', 'POST', `${B}/admin/partner-program/verifications/{{t2Verif}}`, { as: 'admin', body: { action: 'approve', note: 'Confirmed with Xellion support' }, tests: [status(200), json, t('verified', "pm.expect(d.status).to.eql('VERIFIED');")] }),
    req('t2 now holds Starter and passes the lock', 'GET', `${B}/partner-access`, { as: 't2', tests: [status(200), json, acc('7001002'),
      t('verified manually, Starter active', "pm.expect(a.status).to.eql('VERIFIED'); pm.expect(d.packages.find(p => p.name === 'Starter').status).to.eql('ACTIVE'); pm.expect(d.myPerks).to.include('signalx');")] }),
    req('A list re-check doesn’t undo the admin decision', 'POST', `${B}/admin/partners/{{honeyPid}}/recheck`, { as: 'admin', body: {}, tests: [status(200)] }),
    req('t2 still verified', 'GET', `${B}/partner-access`, { as: 't2', tests: [status(200), json, acc('7001002'), t('still verified', "pm.expect(a.status).to.eql('VERIFIED');")] }),
  ] },

  { name: '09a Grace and suspension', item: [
    req('Admin suspends Honey', 'POST', `${B}/admin/partners/{{honeyPid}}/status`, { as: 'admin', body: { action: 'suspend', reason: 'Compliance check' }, tests: [status(200)] }),
    req('t1’s Starter moves to grace (partner grace = 3 days)', 'GET', `${B}/partner-access`, { as: 't1', tests: [status(200), json,
      t('grace with an end date and the reason', "const s = d.packages.find(p => p.name === 'Starter'); pm.expect(s.status).to.eql('GRACE'); const days = (Date.parse(s.graceUntil) - Date.now()) / 864e5; pm.expect(days).to.be.within(2.9, 3.01); pm.expect(s.reasons.join(' ')).to.include('paused'); pm.expect(d.partner.status).to.eql('PAUSED');"),
      t('still usable during grace', "pm.expect(d.myPerks).to.include('signalx');")] }),
    req('Suspended partner portal → 403', 'GET', `${B}/partner/overview`, { as: 'honey', tests: [status(403), code('PARTNER_SUSPENDED')] }),
  ] },

  // run-ib.sh moves the grace end into the past between 09a and 09b.
  { name: '09b After grace', item: [
    req('Grace ends → the scheduled pass suspends', 'POST', `${I}/ib-cycle`, { body: {}, tests: [status(200), json, t('clients recomputed', 'pm.expect(d.clients).to.be.at.least(1);')] }),
    req('t1’s Starter is suspended after grace', 'GET', `${B}/partner-access`, { as: 't1', tests: [status(200), json, t('suspended, lock applies', "const s = d.packages.find(p => p.name === 'Starter'); pm.expect(s.status).to.eql('SUSPENDED'); pm.expect(d.myPerks).to.not.include('signalx');")] }),
    req('Admin reinstates Honey', 'POST', `${B}/admin/partners/{{honeyPid}}/status`, { as: 'admin', body: { action: 'reinstate' }, tests: [status(200)] }),
    req('t1’s Starter is back', 'GET', `${B}/partner-access`, { as: 't1', tests: [status(200), json, t('active again', "pm.expect(d.packages.find(p => p.name === 'Starter').status).to.eql('ACTIVE'); pm.expect(d.partner.status).to.eql('ACTIVE');")] }),
  ] },

  { name: '10 Join later, consent, partner views', item: [
    req('t4 has no partner and can join', 'GET', `${B}/partner-access`, { as: 't4', tests: [status(200), json, t('canJoin', 'pm.expect(d.partner).to.eql(null); pm.expect(d.canJoin).to.eql(true);')] }),
    req('Unknown code → 404', 'POST', `${B}/partner-access/join`, { as: 't4', body: { code: 'NOPE999' }, tests: [status(404)] }),
    req('t4 joins Honey with her code', 'POST', `${B}/partner-access/join`, { as: 't4', body: { code: '{{honeyCode}}' }, tests: [status(200), json, t('linked', "pm.expect(d.partner.name).to.eql(pm.variables.get('honeyName')); pm.expect(d.canJoin).to.eql(false);")] }),
    req('Joining twice → 409', 'POST', `${B}/partner-access/join`, { as: 't4', body: { code: '{{honeyCode}}' }, tests: [status(409)] }),
    req('Honey can’t join herself', 'POST', `${B}/partner-access/join`, { as: 'honey', body: { code: '{{honeyCode}}' }, tests: [status(409)] }),
    req('Partner clients: P&L hidden without consent', 'GET', `${B}/partner/clients`, { as: 'honey', query: 'pageSize=50', tests: [status(200), json,
      "const c = d.items.find(x => x.name === pm.variables.get('t1Name'));",
      t('t1 verified + eligible, P&L null', "pm.expect(c.ib.verification).to.eql('VERIFIED'); pm.expect(c.ib.eligible).to.eql(true); pm.expect(c.ib.consent).to.eql(false); pm.expect(c.ib.pnl30d).to.eql(null);"),
      t('t4 came in late', "pm.expect(d.items.find(x => x.name === pm.variables.get('t4Name')).via).to.eql('late');")] }),
    req('t1 shares their P&L', 'POST', `${B}/partner-access/consent`, { as: 't1', body: { share: true }, tests: [status(200), json, t('consent on', 'pm.expect(d.consent.share).to.eql(true); pm.expect(d.consent.at).to.be.a("string");')] }),
    req('Partner now sees t1’s P&L', 'GET', `${B}/partner/clients`, { as: 'honey', query: 'pageSize=50', tests: [status(200), json,
      "const c = d.items.find(x => x.name === pm.variables.get('t1Name'));", t('number, not null', "pm.expect(c.ib.consent).to.eql(true); pm.expect(c.ib.pnl30d).to.be.a('number');")] }),
    req('IB filter: verified clients', 'GET', `${B}/partner/clients`, { as: 'honey', query: 'ib=VERIFIED', tests: [status(200), json, t('t1 and t2', "pm.expect(d.items.map(x => x.name).sort()).to.eql([pm.variables.get('t1Name'), pm.variables.get('t2Name')].sort());")] }),
    req('IB filter: not verified', 'GET', `${B}/partner/clients`, { as: 'honey', query: 'ib=UNVERIFIED', tests: [status(200), json, t('t3 only', "pm.expect(d.items.map(x => x.name)).to.eql([pm.variables.get('t3Name')]);")] }),
    req('Partner overview carries the IB funnel', 'GET', `${B}/partner/overview`, { as: 'honey', query: 'range=ALL', tests: [status(200), json,
      t('4 signups, 3 connected, 2 verified, 2 eligible', "const f = d.ib.funnel; pm.expect([f.signups, f.connected, f.verified, f.eligible]).to.eql([4, 3, 2, 2]);"),
      t('needs attention: 1 unsupported', "pm.expect(d.ib.needsAttention.unsupported).to.eql(1); pm.expect(d.ib.packages.live).to.eql(2);"),
      t('trading summary present', "pm.expect(d.ib.trading.connected).to.eql(3);")] }),
  ] },

  { name: '11 Super admin', item: [
    req('Programme overview', 'GET', `${B}/admin/partner-program`, { as: 'admin', query: 'range=ALL', tests: [status(200), json,
      t('one active partner', "pm.expect(d.partners.active).to.eql(1);"),
      "const r = d.rows.find(x => x.id === pm.variables.get('honeyPid'));",
      t('Honey row', "pm.expect([r.clients, r.connected, r.verified, r.eligible]).to.eql([4, 3, 2, 2]);"),
      t('funnel matches', "pm.expect(d.funnel.verified).to.eql(2);")] }),
    req('Non-admin → 403', 'GET', `${B}/admin/partner-program`, { as: 't1', tests: [status(403)] }),
    req('Admin clients include P&L regardless of consent', 'GET', `${B}/admin/partners/{{honeyPid}}/clients`, { as: 'admin', query: 'pageSize=50', tests: [status(200), json,
      "const c = d.items.find(x => x.name === pm.variables.get('t2Name'));", t('number for admin', "pm.expect(c.ib.pnl30d).to.be.a('number');")] }),
    req('Event log', 'GET', `${B}/admin/partner-program/events`, { as: 'admin', query: 'partnerId={{honeyPid}}&limit=200', tests: [status(200), json,
      t('syncs, verifications, access and consent recorded', "const k = d.map(e => e.kind); ['ib.connect','ib.sync','verify.verified','verify.manual_approve','access.grant','access.grace','consent.on','referral.late_code'].forEach(x => pm.expect(k).to.include(x));")] }),
    req('Clients CSV export', 'GET', `${B}/admin/partner-program/export`, { as: 'admin', query: 'type=clients', tests: [status(200),
      t('csv with a header and t1', "pm.expect(pm.response.headers.get('Content-Type')).to.include('text/csv'); const txt = pm.response.text(); pm.expect(txt.split('\\n')[0]).to.include('verification'); pm.expect(txt).to.include(pm.variables.get('t1Email'));")] }),
    req('Partners CSV export', 'GET', `${B}/admin/partner-program/export`, { as: 'admin', query: 'type=partners', tests: [status(200), t('Honey listed', "pm.expect(pm.response.text()).to.include(pm.variables.get('honeyEmail'));")] }),
  ] },

  { name: '12 Disconnect', item: [
    req('Honey disconnects Xellion', 'DELETE', `${B}/partner/brokers/{{xlId}}`, { as: 'honey', tests: [status(204)] }),
    req('t1 is no longer verifiable and Starter goes to grace', 'GET', `${B}/partner-access`, { as: 't1', tests: [status(200), json, acc('7001001'),
      t('unsupported now, grace', "pm.expect(a.status).to.eql('UNSUPPORTED_BROKER'); pm.expect(d.packages.find(p => p.name === 'Starter').status).to.eql('GRACE');")] }),
    req('t2’s manual approval survives', 'GET', `${B}/partner-access`, { as: 't2', tests: [status(200), json, acc('7001002'), t('still verified', "pm.expect(a.status).to.eql('VERIFIED');")] }),
  ] },
);


// ── Phase 2 ───────────────────────────────────────────────────────────────────
const P = '{{baseUrl}}/api';
const SETTINGS = { activeMinTrades: 1, activeWindowDays: 30, activeMinLots: 0, graceDays: 7, partnerGraceDays: 3, lockedPerks: ['signalx'], ibApiHosts: [] };
const pb = (name, query, tests) => req(name, 'GET', `${P}/ib/postback/{{pbToken}}`, { query, tests });
const pkgOf = (n) => `const k = d.packages.find(p => p.name === '${n}');`;

folders.push(
  { name: '13 Broker integrations', item: [
    req('Reconnect Xellion', 'POST', `${P}/partner/brokers`, { as: 'honey', body: { broker: 'xellion', method: 'LIST', ibId: 'XL-4471' }, tests: [status(201), json, "pm.collectionVariables.set('xl2', d.id);"] }),
    req('Integration gives a secret postback URL', 'GET', `${P}/partner/brokers/{{xl2}}/integration`, { as: 'honey', tests: [status(200), json,
      t('url with a long token', "pm.expect(d.postbackUrl).to.match(/\\/api\\/ib\\/postback\\/[A-Za-z0-9_-]{30,}$/); pm.expect(d.postbackParams.map(p => p.name)).to.include('account_id');"),
      "pm.collectionVariables.set('pbToken', d.postbackUrl.split('/').pop());"] }),
    req('A 300 KB list uploads (body limit raised for lists)', 'POST', `${P}/partner/brokers/{{xl2}}/accounts`, { as: 'honey',
      pre: ["let rows = ['Account ID,Email','7001001,tara@broker.test']; for (let i = 0; i < 14000; i++) rows.push(String(8100000 + i) + ',bulk' + i + '@mail.test'); pm.collectionVariables.set('bigList', JSON.stringify({ text: rows.join('\\n'), mode: 'replace' }));"],
      body: '{{bigList}}', tests: [status(200), json, t('all rows in', 'pm.expect(d.broker.accountCount).to.be.at.least(14001);')] }),
    req('Wrong token → 404', 'GET', `${P}/ib/postback/not-a-real-token-at-all-xxxxxxxx`, { query: 'event=registration&login=1234567', tests: [status(404)] }),
    pb('Unknown event is logged and ignored', 'foo=bar&login=7009998', [status(200), t('ignored', "pm.expect(pm.response.json().status).to.eql('ignored');")]),
    pb('Registration postback for an MT4 account', 'event=registration&login=7002001&email=omar.mt4@mail.test&platform=MT4', [status(200), t('ok', "pm.expect(pm.response.json().status).to.eql('ok');")]),
    pb('Trade postback', 'event=trade&account_id=7002001&lots=0.5', [status(200)]),
    pb('Another trade', 'event=trade&account_id=7002001&lots=0.25', [status(200)]),
    pb('Commission postback', 'event=commission&account_id=7002001&commission=12.5&currency=USD&event_id=C-1', [status(200)]),
    pb('Same commission again (counted once)', 'event=commission&account_id=7002001&commission=12.5&currency=USD&event_id=C-1', [status(200)]),
    (() => { const r = req('Form-encoded deposit postback', 'POST', `${P}/ib/postback/{{pbToken}}`, { tests: [status(200), t('ok', "pm.expect(pm.response.json().status).to.eql('ok');")] });
      r.request.header = [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }];
      r.request.body = { mode: 'urlencoded', urlencoded: [{ key: 'type', value: 'deposit' }, { key: 'login', value: '7002001' }, { key: 'amount', value: '200' }] };
      return r; })(),
    req('Events are logged', 'GET', `${P}/partner/brokers/{{xl2}}/integration`, { as: 'honey', tests: [status(200), json,
      t('kinds recorded', "const k = d.events.map(e => e.kind); ['registration','trade','commission','deposit','unknown'].forEach(x => pm.expect(k).to.include(x));"),
      t('ignored one marked', "pm.expect(d.events.some(e => e.status === 'ignored')).to.eql(true);")] }),
    req('Commission report upload', 'POST', `${P}/partner/brokers/{{xl2}}/earnings`, { as: 'honey',
      body: { text: 'Date,Account,Commission,Currency,Transaction ID\n2026-10-01,7001001,20.00,USD,T-1\n2026-10-02,7001001,5.50,USD,T-2\n2026-10-02,7001001,5.50,USD,T-2\n', currency: 'USD' },
      tests: [status(200), json, t('2 new, 1 repeat', 'pm.expect(d.added).to.eql(2); pm.expect(d.duplicates).to.eql(1);')] }),
    req('Report without a date column → 422', 'POST', `${P}/partner/brokers/{{xl2}}/earnings`, { as: 'honey', body: { text: 'account,amount\n1,2\n', currency: 'USD' }, tests: [status(422)] }),
    req('API at an unapproved host → 422', 'PUT', `${P}/partner/brokers/{{xl2}}/api`, { as: 'honey',
      body: { config: { baseUrl: 'https://evil.example.com', auth: 'bearer', clientsPath: '/clients', fields: { accountId: 'id' } }, secret: 'k-123456789' }, tests: [status(422), code('IB_API_HOST')] }),
    req('API over plain http → 422', 'PUT', `${P}/partner/brokers/{{xl2}}/api`, { as: 'honey',
      body: { config: { baseUrl: 'http://169.254.169.254', auth: 'bearer', clientsPath: '/latest', fields: { accountId: 'id' } }, secret: 'k-123456789' }, tests: [status(422)] }),
    req('Admin saves settings', 'PUT', `${P}/admin/partner-program/settings`, { as: 'admin', body: SETTINGS, tests: [status(200), json, t('saved, no money settings', "pm.expect(d.partnerGraceDays).to.eql(3); pm.expect(d).to.not.have.property('platformSharePct');")] }),
    req('Partner earnings show reported IB commission only', 'GET', `${P}/partner/earnings`, { as: 'honey', tests: [status(200), json, t('12.5 + 20 + 5.5, nothing else', "pm.expect(d.ib.total).to.eql(38); pm.expect(Object.keys(d)).to.eql(['ib']);")] }),
  ] },

  { name: '14 MT4 and other platforms', item: [
    req('Omar adds his MT4 account', 'POST', `${P}/partner-access/accounts`, { as: 't4', body: { platform: 'MT4', login: '7002001', server: 'Xellion-Real', broker: 'Xellion' },
      tests: [status(201), json, "const a = d.accounts.find(x => x.label.startsWith('7002001'));",
        t('listed but needs a human', "pm.expect(a.kind).to.eql('external'); pm.expect(a.platform).to.eql('MT4'); pm.expect(a.status).to.eql('MANUAL_REVIEW'); pm.expect(a.reason).to.include('isn’t connected');")] }),
    req('Someone else can’t claim the same account', 'POST', `${P}/partner-access/accounts`, { as: 't2', body: { platform: 'MT4', login: '7002001', server: 'Xellion-Real', broker: 'Xellion' }, tests: [status(409)] }),
    req('Bad account number → 422', 'POST', `${P}/partner-access/accounts`, { as: 't4', body: { platform: 'MT4', login: '7!', server: 'X', broker: 'Xellion' }, tests: [status(422)] }),
    req('Admin sees it in review', 'GET', `${P}/admin/partner-program/reviews`, { as: 'admin', tests: [status(200), json,
      "const v = d.find(x => x.kind === 'verification' && x.account && x.account.login === '7002001');",
      t('MT4, unproven ownership', "pm.expect(v.account.platform).to.eql('MT4'); pm.expect(v.signal).to.eql('listed-unproven');"), "pm.collectionVariables.set('t4Verif', v.id);"] }),
    req('Admin confirms it', 'POST', `${P}/admin/partner-program/verifications/{{t4Verif}}`, { as: 'admin', body: { action: 'approve', note: 'Checked with Xellion' }, tests: [status(200)] }),
    req('Activity comes from broker reports', 'POST', `{{baseUrl}}/internal/partners/refresh-stats`, { body: { limit: 50 }, tests: [status(200)] }),
    req('Omar is verified, active, and holds Starter', 'GET', `${P}/partner-access`, { as: 't4', tests: [status(200), json,
      "const a = d.accounts.find(x => x.label.startsWith('7002001'));",
      t('verified + active', "pm.expect(a.status).to.eql('VERIFIED'); pm.expect(d.activity.active).to.eql(true); pm.expect(d.activity.trades).to.be.at.least(2);"),
      t('Starter unlocked', "pm.expect(d.packages.find(p => p.name === 'Starter').status).to.eql('ACTIVE');")] }),
  ] },

  { name: '15 Partner tools', item: [
    req('Honey creates an indicator', 'POST', `${P}/partner/products`, { as: 'honey', body: { type: 'INDICATOR', name: 'Honey Ribbon', platform: 'TradingView', description: 'Trend ribbon', content: '//@version=5\nindicator("Honey Ribbon")\nplot(close)' },
      tests: [status(201), json, t('draft', "pm.expect(d.status).to.eql('DRAFT');"), "pm.collectionVariables.set('prod1', d.id);"] }),
    req('Honey creates an EA', 'POST', `${P}/partner/products`, { as: 'honey', body: { type: 'ALGORITHM', name: 'Honey EA', platform: 'MT5' }, tests: [status(201), json, "pm.collectionVariables.set('prod2', d.id);"] }),
    req('An empty tool can’t be submitted → 422', 'POST', `${P}/partner/products/{{prod2}}/submit`, { as: 'honey', tests: [status(422)] }),
    req('Attach the EA file (base64)', 'POST', `${P}/partner/products/{{prod2}}/file`, { as: 'honey', body: { fileName: 'HoneyEA.ex5', fileType: 'application/octet-stream', data: 'SG9uZXkgRUEgYmluYXJ5' },
      tests: [status(200), json, t('file stored', "pm.expect(d.fileName).to.eql('HoneyEA.ex5'); pm.expect(d.fileSize).to.eql(15);")] }),
    req('Submit the indicator', 'POST', `${P}/partner/products/{{prod1}}/submit`, { as: 'honey', tests: [status(200), json, t('pending', "pm.expect(d.status).to.eql('PENDING');")] }),
    req('Submit the EA', 'POST', `${P}/partner/products/{{prod2}}/submit`, { as: 'honey', tests: [status(200)] }),
    req('Admin queue has both', 'GET', `${P}/admin/partner-program/products`, { as: 'admin', tests: [status(200), json, t('2 pending', "pm.expect(d.filter(x => x.partner.name === pm.variables.get('honeyName')).length).to.eql(2);")] }),
    req('Rejecting needs a note → 422', 'POST', `${P}/admin/partner-program/products/{{prod1}}/review`, { as: 'admin', body: { action: 'reject' }, tests: [status(422)] }),
    req('Admin sends the indicator back', 'POST', `${P}/admin/partner-program/products/{{prod1}}/review`, { as: 'admin', body: { action: 'reject', note: 'Add a description of the inputs' }, tests: [status(200)] }),
    req('Honey fixes and resubmits', 'PATCH', `${P}/partner/products/{{prod1}}`, { as: 'honey', body: { description: 'Trend ribbon. Inputs: length 20.' }, tests: [status(200)] }),
    req('Resubmit', 'POST', `${P}/partner/products/{{prod1}}/submit`, { as: 'honey', tests: [status(200)] }),
    req('Admin approves the indicator', 'POST', `${P}/admin/partner-program/products/{{prod1}}/review`, { as: 'admin', body: { action: 'approve' }, tests: [status(200)] }),
    req('Admin downloads the EA to inspect', 'GET', `${P}/admin/partner-program/products/{{prod2}}/file`, { as: 'admin', tests: [status(200), t('raw bytes', "pm.expect(pm.response.text()).to.eql('Honey EA binary');")] }),
    req('Admin approves the EA', 'POST', `${P}/admin/partner-program/products/{{prod2}}/review`, { as: 'admin', body: { action: 'approve' }, tests: [status(200)] }),
    req('Not in a package yet → client 404', 'GET', `${P}/partner-access/products/{{prod1}}`, { as: 't1', tests: [status(404)] }),
    req('Package with someone else’s tool → 422', 'PATCH', `${P}/partner/packages/{{pkgStarter}}`, { as: 'honey', body: { productIds: ['nope'] }, tests: [status(422)] }),
    req('Honey adds both tools to Starter', 'PATCH', `${P}/partner/packages/{{pkgStarter}}`, { as: 'honey', body: { productIds: ['{{prod1}}', '{{prod2}}'] }, tests: [status(200), json, t('2 tools', 'pm.expect(d.productIds.length).to.eql(2);')] }),
    req('t1 sees both tools', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, t('2 tools', "pm.expect(d.products.map(p => p.name).sort()).to.eql(['Honey EA', 'Honey Ribbon']);")] }),
    req('t1 opens the indicator', 'GET', `${P}/partner-access/products/{{prod1}}`, { as: 't1', tests: [status(200), json, t('code', "pm.expect(d.content).to.include('indicator(\"Honey Ribbon\")');")] }),
    req('t1 downloads the EA', 'GET', `${P}/partner-access/products/{{prod2}}/file`, { as: 't1', tests: [status(200), t('attachment', "pm.expect(pm.response.headers.get('Content-Disposition')).to.include('HoneyEA.ex5'); pm.expect(pm.response.text()).to.eql('Honey EA binary');")] }),
    req('t3 (no package) can’t download it', 'GET', `${P}/partner-access/products/{{prod2}}/file`, { as: 't3', tests: [status(404)] }),
    req('Partner sees who used them', 'GET', `${P}/partner/products`, { as: 'honey', tests: [status(200), json, t('opens counted', "const p = d.find(x => x.name === 'Honey Ribbon'); pm.expect(p.opens30d).to.be.at.least(1); pm.expect(p.users30d).to.eql(1); pm.expect(p.packages).to.include('Starter');")] }),
    req('Changing approved code needs a new review', 'PATCH', `${P}/partner/products/{{prod1}}`, { as: 'honey', body: { content: '//@version=5\nindicator("Honey Ribbon v2")' }, tests: [status(200), json, t('v2 pending', "pm.expect(d.status).to.eql('PENDING'); pm.expect(d.version).to.eql(2);")] }),
    req('Until then clients only see the EA', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, t('1 tool', "pm.expect(d.products.map(p => p.name)).to.eql(['Honey EA']);")] }),
    req('Admin approves v2', 'POST', `${P}/admin/partner-program/products/{{prod1}}/review`, { as: 'admin', body: { action: 'approve' }, tests: [status(200)] }),
    req('Admin turns tools off for Honey', 'PUT', `${P}/admin/partners/{{honeyPid}}/terms`, { as: 'admin', body: { permissions: { canOfferProducts: false, maxPackages: 10 } }, tests: [status(200)] }),
    req('Honey can’t add tools now → 403', 'POST', `${P}/partner/products`, { as: 'honey', body: { type: 'GUIDE', name: 'Playbook', url: 'https://example.com/guide.pdf' }, tests: [status(403), code('PRODUCTS_NOT_ALLOWED')] }),
    req('Admin turns them back on', 'PUT', `${P}/admin/partners/{{honeyPid}}/terms`, { as: 'admin', body: { permissions: { canOfferProducts: true, maxPackages: 10 } }, tests: [status(200), json, t('on', 'pm.expect(d.permissions).to.eql({ canOfferProducts: true, maxPackages: 10 });')] }),
  ] },

  { name: '16 Package moderation', item: [
    req('Honey publishes VIP (packages are free)', 'POST', `${P}/partner/packages`, { as: 'honey', body: { name: 'VIP', perks: ['options'], requireActive: false, status: 'LIVE' },
      tests: [status(201), json, t('no price fields', "pm.expect(d).to.not.have.property('priceCents'); pm.expect(d).to.not.have.property('subscribers');"), "pm.collectionVariables.set('pkgVip', d.id);"] }),
    req('A price is ignored', 'PATCH', `${P}/partner/packages/{{pkgVip}}`, { as: 'honey', body: { priceCents: 2900 }, tests: [status(200), json, t('still no price', "pm.expect(d).to.not.have.property('priceCents');")] }),
    req('t1 unlocks VIP by qualifying', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, pkgOf('VIP'),
      t('active, nothing to pay', "pm.expect(k.status).to.eql('ACTIVE'); pm.expect(k.reasons).to.eql([]); pm.expect(k).to.not.have.property('canSubscribe'); pm.expect(d).to.not.have.property('paymentsEnabled');")] }),
    req('Checkout is gone → 404', 'POST', `${P}/partner-access/packages/{{pkgVip}}/checkout`, { as: 't1', tests: [status(404)] }),
    req('Razorpay webhook is gone → 404', 'POST', `${P}/payments/razorpay/webhook`, { body: {}, tests: [status(404)] }),
    req('Payout details are gone → 404', 'PUT', `${P}/partner/payout-details`, { as: 'honey', body: { details: 'UPI: honey@okicici' }, tests: [status(404)] }),
    req('Admin finance is gone → 404', 'GET', `${P}/admin/partner-program/finance`, { as: 'admin', tests: [status(404)] }),
    req('Admin pauses VIP', 'POST', `${P}/admin/partner-program/packages/{{pkgVip}}/hold`, { as: 'admin', body: { adminHold: true, note: 'Checking the claims in the description' }, tests: [status(200)] }),
    req('t1’s VIP goes to grace', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, pkgOf('VIP'), t('grace with the reason', "pm.expect(k.status).to.eql('GRACE'); pm.expect(k.reasons.join(' ')).to.include('paused');")] }),
    req('Admin releases VIP', 'POST', `${P}/admin/partner-program/packages/{{pkgVip}}/hold`, { as: 'admin', body: { adminHold: false }, tests: [status(200)] }),
    req('t1’s VIP is back', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, pkgOf('VIP'), t('active', "pm.expect(k.status).to.eql('ACTIVE');")] }),
    req('Admin limits Honey to 1 package', 'PUT', `${P}/admin/partners/{{honeyPid}}/terms`, { as: 'admin', body: { permissions: { canOfferProducts: true, maxPackages: 1 } }, tests: [status(200)] }),
    req('Another package is refused → 409', 'POST', `${P}/partner/packages`, { as: 'honey', body: { name: 'Extra', perks: ['options'], status: 'DRAFT' }, tests: [status(409)] }),
    req('Admin restores the limit', 'PUT', `${P}/admin/partners/{{honeyPid}}/terms`, { as: 'admin', body: { permissions: { canOfferProducts: true, maxPackages: 10 } }, tests: [status(200)] }),
  ] },

  { name: '17 Reports', item: [
    req('Partner reports', 'GET', `${P}/partner/reports`, { as: 'honey', query: 'range=ALL', tests: [status(200), json,
      t('daily series with every step', "pm.expect(d.daily.length).to.be.at.least(1); pm.expect(d.daily.reduce((n, x) => n + x.signups, 0)).to.eql(4); pm.expect(d.daily.reduce((n, x) => n + x.verified, 0)).to.be.at.least(3);"),
      t('cohort', "pm.expect(d.cohorts[0].signups).to.eql(4); pm.expect(d.cohorts[0].verified).to.be.at.least(3);"),
      t('tools used', "pm.expect(d.products.find(p => p.name === 'Honey Ribbon').opens).to.be.at.least(1);"),
      t('package holders', "const v = d.marketplace.packageSubs.find(p => p.name === 'VIP'); pm.expect(v.active).to.be.at.least(1); pm.expect(v).to.not.have.property('revenueCents');"),
      t('IB earnings by month', "pm.expect(d.earningsByMonth.reduce((n, m) => n + m.ib, 0)).to.eql(38); pm.expect(d.earningsByMonth[0]).to.not.have.property('salesShareCents');")] }),
    req('Partner CSV keeps P&L private without consent', 'GET', `${P}/partner/export`, { as: 'honey', tests: [status(200),
      t('csv', "const txt = pm.response.text(); pm.expect(txt.split('\\n')[0]).to.include('broker_check'); pm.expect(txt).to.not.include('@partners.test'); pm.expect(txt).to.include('private');")] }),
    req('Admin cohorts', 'GET', `${P}/admin/partner-program/cohorts`, { as: 'admin', tests: [status(200), json, t('rows', 'pm.expect(d[0].signups).to.eql(4);')] }),
    req('Admin package list', 'GET', `${P}/admin/partner-program/packages`, { as: 'admin', tests: [status(200), json, t('VIP with holders', "const v = d.find(p => p.name === 'VIP'); pm.expect(v.partner).to.eql(pm.variables.get('honeyName')); pm.expect(v.holders).to.be.at.least(1);")] }),
    req('Event log has moderation events', 'GET', `${P}/admin/partner-program/events`, { as: 'admin', query: 'partnerId={{honeyPid}}&limit=500', tests: [status(200), json,
      t('kinds', "const k = d.map(e => e.kind); ['product.approve','package.hold','package.release','partner.terms','account.external_add'].forEach(x => pm.expect(k).to.include(x));")] }),
  ] },
);

// ── Custom date ranges and package end dates ──────────────────────────────────
// Dates are UTC days, worked out in a pre-request script on every request.
const DATES = [
  "const D = 864e5, iso = t => new Date(t).toISOString().slice(0, 10), now = Date.now();",
  "pm.collectionVariables.set('today', iso(now)); pm.collectionVariables.set('yesterday', iso(now - D)); pm.collectionVariables.set('plus30', iso(now + 30 * D));",
  "pm.collectionVariables.set('tomorrowStart', iso(now + D) + 'T00:00:00.000Z'); pm.collectionVariables.set('plus31Start', iso(now + 31 * D) + 'T00:00:00.000Z');",
  "pm.collectionVariables.set('tooLongTo', iso(Date.parse('2025-01-01') + 366 * D));",
];
const dq = (name, method, url, o = {}) => req(name, method, url, { ...o, pre: [...DATES, ...(o.pre ?? [])] });
const PAST = 'range=CUSTOM&from=2020-01-01&to=2020-01-31';
const TODAY = 'range=CUSTOM&from={{today}}&to={{today}}';
const ltd = `const k = d.packages.find(p => p.name === 'Limited');`;
const SETTINGS_LOCK = { ...SETTINGS, lockedPerks: ['signalx', 'screener'] };

folders.push(
  { name: '18a Custom ranges', item: [
    dq('Range: custom needs both dates → 422', 'GET', `${P}/partner/overview`, { as: 'honey', query: 'range=CUSTOM&from=2026-10-01', tests: [status(422), t('says which', "pm.expect(pm.response.json().error.details).to.have.property('to');")] }),
    dq('Range: end before start → 422', 'GET', `${P}/partner/overview`, { as: 'honey', query: 'range=CUSTOM&from=2026-10-31&to=2026-10-01', tests: [status(422)] }),
    dq('Range: more than 366 days → 422', 'GET', `${P}/partner/reports`, { as: 'honey', query: 'range=CUSTOM&from=2025-01-01&to={{tooLongTo}}', tests: [status(422)] }),
    dq('Range: exactly 366 days is fine', 'GET', `${P}/partner/reports`, { as: 'honey', query: 'range=CUSTOM&from=2025-01-01&to=2026-01-01', tests: [status(200), json, t('366 days', 'pm.expect(d.daily).to.have.length(366);')] }),
    dq('Range: not a real date → 422', 'GET', `${P}/admin/partner-program`, { as: 'admin', query: 'range=CUSTOM&from=2026-02-30&to=2026-03-01', tests: [status(422)] }),
    dq('Range: wrong format → 422', 'GET', `${P}/admin/partner-program/export`, { as: 'admin', query: 'type=clients&range=CUSTOM&from=1-10-2026&to=2026-10-31', tests: [status(422)] }),
    dq('Range: unknown preset → 422', 'GET', `${P}/partner/overview`, { as: 'honey', query: 'range=YTD', tests: [status(422)] }),
    dq('Overview, all time (baseline)', 'GET', `${P}/partner/overview`, { as: 'honey', query: 'range=ALL', tests: [status(200), json,
      "pm.collectionVariables.set('allSignups', d.funnel.signups); pm.collectionVariables.set('allClicks', d.funnel.clicks); pm.collectionVariables.set('allIbVerified', d.ib.funnel.verified);",
      t('has signups', 'pm.expect(d.funnel.signups).to.be.at.least(4);')] }),
    dq('Overview, custom = today (every test signup happened today)', 'GET', `${P}/partner/overview`, { as: 'honey', query: TODAY, tests: [status(200), json,
      t('same as all time', "pm.expect(d.funnel.signups).to.eql(Number(pm.collectionVariables.get('allSignups'))); pm.expect(d.funnel.clicks).to.eql(Number(pm.collectionVariables.get('allClicks'))); pm.expect(d.ib.funnel.verified).to.eql(Number(pm.collectionVariables.get('allIbVerified')));"),
      t('window echoed', "pm.expect(d.funnel.range).to.eql('CUSTOM'); pm.expect(d.funnel.from).to.eql(pm.collectionVariables.get('today') + 'T00:00:00.000Z'); pm.expect(d.funnel.to).to.eql(pm.collectionVariables.get('tomorrowStart'));"),
      t('one day in the series', "pm.expect(d.daily.map(x => x.date)).to.eql([pm.collectionVariables.get('today')]);")] }),
    dq('Overview, custom = Jan 2020 (before anything)', 'GET', `${P}/partner/overview`, { as: 'honey', query: PAST, tests: [status(200), json,
      t('zeros', 'pm.expect(d.funnel.signups).to.eql(0); pm.expect(d.funnel.clicks).to.eql(0); pm.expect(d.funnel.connected).to.eql(0); pm.expect(d.ib.funnel.verified).to.eql(0); pm.expect(d.ib.funnel.eligible).to.eql(0);'),
      t('31 days, all zero', "pm.expect(d.daily).to.have.length(31); pm.expect(d.daily[0].date).to.eql('2020-01-01'); pm.expect(d.daily[30].date).to.eql('2020-01-31'); pm.expect(d.daily.reduce((n, x) => n + x.signups + x.clicks, 0)).to.eql(0);")] }),
    dq('Overview, custom range in the future: empty, not an error', 'GET', `${P}/partner/overview`, { as: 'honey', query: 'range=CUSTOM&from=2099-01-01&to=2099-01-05', tests: [status(200), json, t('nothing', 'pm.expect(d.daily).to.eql([]); pm.expect(d.funnel.signups).to.eql(0);')] }),
    dq('Reports, custom = today', 'GET', `${P}/partner/reports`, { as: 'honey', query: TODAY, tests: [status(200), json,
      t('every step today', "pm.expect(d.range).to.eql('CUSTOM'); pm.expect(d.daily).to.have.length(1); pm.expect(d.daily[0].signups).to.eql(4); pm.expect(d.daily[0].verified).to.be.at.least(3);"),
      t('channels counted in the window', 'pm.expect(d.channels.reduce((n, c) => n + c.signups, 0)).to.eql(4);')] }),
    dq('Reports, custom = Jan 2020', 'GET', `${P}/partner/reports`, { as: 'honey', query: PAST, tests: [status(200), json,
      t('all zero', "pm.expect(d.daily).to.have.length(31); pm.expect(d.daily.reduce((n, x) => n + x.clicks + x.signups + x.connected + x.verified + x.unlocked, 0)).to.eql(0); pm.expect(d.channels.reduce((n, c) => n + c.signups + c.clicks, 0)).to.eql(0);")] }),
    dq('Reports, a range ending today', 'GET', `${P}/partner/reports`, { as: 'honey', query: 'range=CUSTOM&from={{yesterday}}&to={{today}}', tests: [status(200), json, t('two days', "pm.expect(d.daily.map(x => x.date)).to.eql([pm.collectionVariables.get('yesterday'), pm.collectionVariables.get('today')]); pm.expect(d.daily[1].signups).to.eql(4);")] }),
    dq('Admin programme, all time (baseline)', 'GET', `${P}/admin/partner-program`, { as: 'admin', query: 'range=ALL', tests: [status(200), json, "pm.collectionVariables.set('progSignups', d.funnel.signups);"] }),
    dq('Admin programme, custom = today', 'GET', `${P}/admin/partner-program`, { as: 'admin', query: TODAY, tests: [status(200), json, t('same as all time', "pm.expect(d.range).to.eql('CUSTOM'); pm.expect(d.funnel.signups).to.eql(Number(pm.collectionVariables.get('progSignups')));")] }),
    dq('Admin programme, custom = Jan 2020', 'GET', `${P}/admin/partner-program`, { as: 'admin', query: PAST, tests: [status(200), json, t('zero', 'pm.expect(d.funnel.signups).to.eql(0); pm.expect(d.funnel.clicks).to.eql(0);')] }),
    dq('Admin partner drill-down, custom = Jan 2020', 'GET', `${P}/admin/partners/{{honeyPid}}`, { as: 'admin', query: PAST, tests: [status(200), json, t('zero', 'pm.expect(d.funnel.signups).to.eql(0); pm.expect(d.daily).to.have.length(31);')] }),
    dq('Admin partner drill-down, custom = today', 'GET', `${P}/admin/partners/{{honeyPid}}`, { as: 'admin', query: TODAY, tests: [status(200), json, t('all', "pm.expect(d.funnel.signups).to.eql(Number(pm.collectionVariables.get('allSignups')));")] }),
    dq('Clients CSV, Jan 2020: header only', 'GET', `${P}/admin/partner-program/export`, { as: 'admin', query: `type=clients&${PAST}`, tests: [status(200),
      t('no rows', "pm.expect(pm.response.text().trim().split('\\n')).to.have.length(1);"),
      t('file named after the range', "pm.expect(pm.response.headers.get('Content-Disposition')).to.include('2020-01-01_to_2020-01-31');")] }),
    dq('Clients CSV, today: every referred client', 'GET', `${P}/admin/partner-program/export`, { as: 'admin', query: `type=clients&${TODAY}`, tests: [status(200), t('rows', "pm.expect(pm.response.text().trim().split('\\n').length - 1).to.eql(Number(pm.collectionVariables.get('progSignups')));")] }),
    dq('Clients CSV, no range: all time as before', 'GET', `${P}/admin/partner-program/export`, { as: 'admin', query: 'type=clients', tests: [status(200), t('rows', "pm.expect(pm.response.text().trim().split('\\n').length - 1).to.eql(Number(pm.collectionVariables.get('progSignups')));")] }),
    dq('Partners CSV with a range adds range columns', 'GET', `${P}/admin/partner-program/export`, { as: 'admin', query: `type=partners&${PAST}`, tests: [status(200),
      t('columns + zero', "const [h, r] = pm.response.text().trim().split('\\n'); const cols = h.split(','); pm.expect(cols).to.include('signups_in_range'); pm.expect(r.split(',')[cols.indexOf('range')]).to.eql('2020-01-01..2020-01-31'); pm.expect(r.split(',')[cols.indexOf('signups_in_range')]).to.eql('0');")] }),
    dq('Partners CSV without a range has no range columns', 'GET', `${P}/admin/partner-program/export`, { as: 'admin', query: 'type=partners', tests: [status(200), t('plain', "pm.expect(pm.response.text().split('\\n')[0]).to.not.include('in_range');")] }),
    dq('Partner’s own CSV, Jan 2020: header only', 'GET', `${P}/partner/export`, { as: 'honey', query: PAST, tests: [status(200), t('no rows', "pm.expect(pm.response.text().trim().split('\\n')).to.have.length(1);")] }),
    dq('Partner’s own CSV, today', 'GET', `${P}/partner/export`, { as: 'honey', query: TODAY, tests: [status(200), t('4 clients', "pm.expect(pm.response.text().trim().split('\\n').length - 1).to.eql(4);")] }),
    dq('Attention counts clients, not accounts (baseline)', 'GET', `${P}/partner/overview`, { as: 'honey', query: 'range=ALL', tests: [status(200), json, "pm.collectionVariables.set('unsup0', d.ib.needsAttention.unsupported);"] }),
    dq('Verified t1 adds an account at a broker Honey hasn’t connected', 'POST', `${P}/partner-access/accounts`, { as: 't1', body: { platform: 'MT4', login: '6600123', server: 'Vantage-Live', broker: 'Vantage' },
      tests: [status(201), json, "const a = d.accounts.find(x => x.label.startsWith('6600123'));", t('unsupported account', "pm.expect(a.status).to.eql('UNSUPPORTED_BROKER');"), "pm.collectionVariables.set('t1Ext', a.id);"] }),
    dq('…t1 is still verified, so not counted as “at another broker”', 'GET', `${P}/partner/overview`, { as: 'honey', query: 'range=ALL', tests: [status(200), json, t('unchanged', "pm.expect(d.ib.needsAttention.unsupported).to.eql(Number(pm.collectionVariables.get('unsup0')));")] }),
    dq('t1 removes that account again', 'DELETE', `${P}/partner-access/accounts/{{t1Ext}}`, { as: 't1', tests: [status(200)] }),
    dq('Partner’s own CSV, bad range → 422', 'GET', `${P}/partner/export`, { as: 'honey', query: 'range=CUSTOM&from=2026-10-05&to=2026-10-01', tests: [status(422)] }),
  ] },

  { name: '18b Package end dates', item: [
    dq('Admin locks the screener to package holders', 'PUT', `${P}/admin/partner-program/settings`, { as: 'admin', body: SETTINGS_LOCK, tests: [status(200)] }),
    dq('A last day in the past is refused → 422', 'POST', `${P}/partner/packages`, { as: 'honey', body: { name: 'Old', perks: ['screener'], requireActive: false, endsOn: '{{yesterday}}', status: 'DRAFT' }, tests: [status(422)] }),
    dq('A last day that isn’t a date → 422', 'POST', `${P}/partner/packages`, { as: 'honey', body: { name: 'Old', perks: ['screener'], endsOn: '31/12/2026', status: 'DRAFT' }, tests: [status(422)] }),
    dq('Honey drafts “Limited”, last day today, 365 days of access', 'POST', `${P}/partner/packages`, { as: 'honey',
      body: { name: 'Limited', perks: ['screener'], requireActive: false, accessDays: 365, endsOn: '{{today}}', status: 'DRAFT' },
      tests: [status(201), json, t('end date kept', "pm.expect(d.endsOn).to.eql(pm.collectionVariables.get('today')); pm.expect(d.ended).to.eql(false);"), "pm.collectionVariables.set('pkgLtd', d.id);"] }),
  ] },

  { name: '18c After the last day', item: [
    dq('The package shows as ended to Honey', 'GET', `${P}/partner/packages`, { as: 'honey', tests: [status(200), json, ltd, t('ended, nobody holds it', 'pm.expect(k.ended).to.eql(true); pm.expect(k.holders).to.eql(0);'), "pm.collectionVariables.set('ltdEnds', k.endsOn); pm.collectionVariables.set('pkgLtd', k.id);"] }),
    dq('Going live after it ended', 'PATCH', `${P}/partner/packages/{{pkgLtd}}`, { as: 'honey', body: { status: 'LIVE' }, tests: [status(200)] }),
    dq('t1 qualifies but can’t unlock an ended package', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, t('not offered', "pm.expect(d.packages.map(p => p.name)).to.not.include('Limited');")] }),
    dq('…and the screener stays locked for t1', 'GET', `${P}/partner-access/perks`, { as: 't1', tests: [status(200), json, t('locked', "pm.expect(d.locked).to.include('screener'); pm.expect(d.mine).to.not.include('screener');")] }),
    dq('Re-saving the date it already has is allowed', 'PATCH', `${P}/partner/packages/{{pkgLtd}}`, { as: 'honey', body: { name: 'Limited', endsOn: '{{ltdEnds}}' }, tests: [status(200)] }),
    dq('Moving it to another past day is refused → 422', 'PATCH', `${P}/partner/packages/{{pkgLtd}}`, { as: 'honey', body: { endsOn: '2020-01-01' }, tests: [status(422)] }),
    dq('Honey extends it by 30 days', 'PATCH', `${P}/partner/packages/{{pkgLtd}}`, { as: 'honey', body: { endsOn: '{{plus30}}' }, tests: [status(200), json, t('live again', "pm.expect(d.ended).to.eql(false); pm.expect(d.endsOn).to.eql(pm.collectionVariables.get('plus30')); pm.expect(d.holders).to.be.at.least(1);")] }),
    dq('t1 unlocks it; access stops at the end date, not after 365 days', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, ltd,
      t('active until the last day', "pm.expect(k.status).to.eql('ACTIVE'); pm.expect(k.endsOn).to.eql(pm.collectionVariables.get('plus30')); pm.expect(k.expiresAt).to.eql(pm.collectionVariables.get('plus31Start'));")] }),
    dq('t1 can use the screener now', 'GET', `${P}/partner-access/perks`, { as: 't1', tests: [status(200), json, t('unlocked', "pm.expect(d.mine).to.include('screener');")] }),
    dq('t3 (not verified) sees when the offer ends', 'GET', `${P}/partner-access`, { as: 't3', tests: [status(200), json, ltd, t('locked, with the end', "pm.expect(k.status).to.eql('LOCKED'); pm.expect(k.endsOn).to.eql(pm.collectionVariables.get('plus30'));")] }),
  ] },

  { name: '18d The last day passes', item: [
    dq('Right away, before any scheduled pass: t1’s access has ended', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, ltd,
      t('expired, with the reason', "pm.expect(k.status).to.eql('EXPIRED'); pm.expect(k.reasons).to.eql(['This package has ended.']);")] }),
    dq('Ended packages vanish for clients who never held them', 'GET', `${P}/partner-access`, { as: 't3', tests: [status(200), json, t('gone', "pm.expect(d.packages.map(p => p.name)).to.not.include('Limited');")] }),
    dq('The scheduled pass records it', 'POST', `${I}/ib-cycle`, { body: {}, tests: [status(200)] }),
    dq('Screener locked again for t1', 'GET', `${P}/partner-access/perks`, { as: 't1', tests: [status(200), json, t('locked', "pm.expect(d.mine).to.not.include('screener');")] }),
    dq('Still expired after the pass', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, ltd, t('expired', "pm.expect(k.status).to.eql('EXPIRED'); pm.expect(k.reasons).to.eql(['This package has ended.']);")] }),
    dq('Admin sees it ended', 'GET', `${P}/admin/partner-program/packages`, { as: 'admin', tests: [status(200), json, t('ended', "const v = d.find(p => p.name === 'Limited'); pm.expect(v.ended).to.eql(true); pm.expect(v.holders).to.eql(0); pm.collectionVariables.set('pkgLtd', v.id);")] }),
    dq('Honey removes the end date', 'PATCH', `${P}/partner/packages/{{pkgLtd}}`, { as: 'honey', body: { endsOn: null }, tests: [status(200), json, t('no end', 'pm.expect(d.endsOn).to.eql(null); pm.expect(d.ended).to.eql(false);')] }),
    dq('t1 gets it back (their own 365 days aren’t over)', 'GET', `${P}/partner-access`, { as: 't1', tests: [status(200), json, ltd, t('active again', "pm.expect(k.status).to.eql('ACTIVE'); pm.expect(k.reasons).to.eql([]); pm.expect(k.endsOn).to.eql(null); pm.expect(Date.parse(k.expiresAt) - Date.now()).to.be.above(300 * 864e5);")] }),
    dq('…and the screener with it', 'GET', `${P}/partner-access/perks`, { as: 't1', tests: [status(200), json, t('unlocked', "pm.expect(d.mine).to.include('screener');")] }),
    dq('The event log shows the end and the return', 'GET', `${P}/admin/partner-program/events`, { as: 'admin', query: 'partnerId={{honeyPid}}&limit=500', tests: [status(200), json,
      t('kinds', "const k = d.filter(e => e.message.includes('Limited') || e.kind.startsWith('access.')).map(e => e.kind); ['access.expire', 'access.restore', 'package.update'].forEach(x => pm.expect(k).to.include(x));"),
      t('end change logged', "pm.expect(d.some(e => e.kind === 'package.update' && e.message.includes('last day removed'))).to.eql(true);")] }),
  ] },
);

// Internal calls carry the shared token.
for (const f of folders) for (const r of f.item) {
  if (r.request.url.raw.includes('/internal/partners/')) r.request.header.push(internal);
}
const g = folders.find(f => f.name.startsWith('09b')).item;
if (!g[0].request.header.includes(internal)) g[0].request.header.push(internal);

const variable = [
  { key: 'baseUrl', value: 'http://localhost:4300' },
  { key: 'altUrl', value: 'http://127.0.0.1:4300' },
  { key: 'appUrl', value: 'http://localhost:3060' },
  { key: 'password', value: 'Partner-test-Passw0rd!' },
  { key: 'internalToken', value: 'partner-test-internal-token' },
  ...Object.entries(USERS).flatMap(([k, n]) => [
    { key: `${k}Email`, value: k === 'admin' ? 'admin@partners.test' : `${k}@partners.test` },
    { key: `${k}Name`, value: n },
  ]),
];

const collection = {
  info: {
    name: 'TRADElogs — IB partner flow',
    description: 'The IB partner doc end to end: application, broker list, verification, packages, feature locks, grace, admin review. Run with apps/api/postman/run-ib.sh against a disposable database.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: folders,
  variable,
};
writeFileSync(path.join(dir, 'ib-partner.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
console.log(`wrote ${folders.reduce((n, f) => n + f.item.length, 0)} requests in ${folders.length} folders`);
