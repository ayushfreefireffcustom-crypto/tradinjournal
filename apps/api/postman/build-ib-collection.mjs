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
    req('Catalog lists the brokers', 'GET', `${B}/partner/brokers`, { as: 'honey', tests: [status(200), json, t('xellion + other, no API yet', "const x = d.catalog.find(c => c.key === 'xellion'); pm.expect(x.methods).to.eql(['LIST','SHEET']); pm.expect(d.catalog.map(c => c.key)).to.include('other'); pm.expect(d.brokers).to.eql([]);")] }),
    req('API method without an adapter → 422', 'POST', `${B}/partner/brokers`, { as: 'honey', body: { broker: 'xellion', method: 'API', apiKey: 'live-key-123456' }, tests: [status(422), code('IB_API_UNSUPPORTED')] }),
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
    req('Default settings', 'GET', `${B}/admin/partner-program/settings`, { as: 'admin', tests: [status(200), json, t('nothing locked, 1 trade / 30 days', "pm.expect(d).to.eql({ activeMinTrades: 1, activeWindowDays: 30, activeMinLots: 0, graceDays: 7, partnerGraceDays: 7, lockedPerks: [] });")] }),
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

const g = folders.find(f => f.name.startsWith('09b')).item;
g[0].request.header.push(internal);

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
