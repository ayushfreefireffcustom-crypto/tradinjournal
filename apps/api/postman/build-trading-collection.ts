// Generates trading-platform.postman_collection.json (Postman v2.1): contract
// tests for the modules added since the partner programme (account, feedback,
// strategies and runs, marketplace, alerts and screens, journal, trading desk,
// API keys and /api/v1, exchanges, copy trading, options).
//   cd apps/api && npx tsx postman/build-trading-collection.ts
// Run with postman/run-trading.sh. Nothing here needs the network: no exchange
// keys, no market data, no AI.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY_RISK_VERSION } from '@tradinjournal/contracts';
import { defaultSpec } from '@tradinjournal/core';

const dir = path.dirname(fileURLToPath(import.meta.url));
const AUTH = { a: 'aCookie', b: 'bCookie', admin: 'adminCookie' } as const;
type Who = keyof typeof AUTH;

interface Opts { body?: unknown; as?: Who; tests?: string[]; pre?: string[]; origin?: boolean; headers?: Array<{ key: string; value: string }> }
function req(name: string, method: string, url: string, { body, as, tests = [], pre = [], origin = true, headers: extra = [] }: Opts = {}) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  if (as) headers.push({ key: 'Cookie', value: `{{${AUTH[as]}}}` });
  if (origin) headers.push({ key: 'Origin', value: '{{appUrl}}' });
  headers.push(...extra);
  const [raw, query] = url.split('?');
  return {
    name,
    protocolProfileBehavior: { disableCookies: true, followRedirects: false },
    event: [
      ...(pre.length ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } }] : []),
      { listen: 'test', script: { type: 'text/javascript', exec: tests } },
    ],
    request: {
      method, header: headers,
      url: { raw: url, host: [raw!.split('/')[0]], path: raw!.split('/').slice(1), ...(query ? { query: query.split('&').map((q) => { const [key, value] = q.split('='); return { key, value }; }) } : {}) },
      ...(body !== undefined ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
    },
  };
}

const status = (c: number) => `pm.test('status ${c}', () => pm.response.to.have.status(${c}));`;
const code = (c: string) => `pm.test('error code ${c}', () => pm.expect(pm.response.json().error.code).to.eql('${c}'));`;
const t = (label: string, expr: string) => `pm.test(${JSON.stringify(label)}, () => { ${expr} });`;
const json = 'const d = pm.response.json().data;';
const save = (v: string, expr: string) => `pm.collectionVariables.set('${v}', ${expr});`;
const sessionCookie = "(pm.response.headers.all().filter(h => h.key.toLowerCase() === 'set-cookie').map(h => h.value).find(v => v.startsWith('better-auth.session_token=')) || '').split(';')[0]";
const B = '{{baseUrl}}/api';

const signup = (who: 'a' | 'b') => req(`Sign up ${who.toUpperCase()}`, 'POST', `${B}/auth/sign-up/email`, {
  body: { email: `{{${who}Email}}`, password: '{{password}}', name: `Postman ${who.toUpperCase()}`, country: 'India', city: 'Pune', postalCode: '411001' },
  tests: [status(200)],
});
const signin = (who: Who) => req(`Sign in ${who}`, 'POST', `${B}/auth/sign-in/email`, {
  body: { email: `{{${who}Email}}`, password: who === 'admin' ? '{{adminPassword}}' : '{{password}}' },
  tests: [status(200), `const c = ${sessionCookie};`, t('session cookie issued', 'pm.expect(c).to.match(/^better-auth\\.session_token=/);'), save(AUTH[who], 'c')],
});

const spec = defaultSpec('BTCUSDT');
spec.entry.long = { match: 'all', conditions: [
  { left: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 9 } }, operator: 'crosses_above', right: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 21 } } },
] };
spec.risk.stopLoss = { mode: 'pct', value: 2 };
spec.risk.takeProfit = { mode: 'rr', value: 2 };
const spec2 = { ...spec, risk: { ...spec.risk, stopLoss: { mode: 'pct' as const, value: 3 } } };

const folders = [
  { name: '01 Bootstrap users', item: [signup('a'), signup('b')] },

  { name: '02 Sign in and access', item: [
    signin('a'), signin('b'), signin('admin'),
    ...['/me/profile', '/me/activity', '/strategies', '/deployments', '/marketplace', '/trading/overview', '/exchanges', '/follows', '/journal', '/alerts', '/screener/screens', '/feedback/mine'].map((p) =>
      req(`Anonymous ${p} → 401`, 'GET', `${B}${p}`, { origin: false, tests: [status(401)] })),
    req('Cross-site write → 403', 'POST', `${B}/journal`, { as: 'a', origin: false, headers: [{ key: 'Origin', value: 'https://evil.example' }], body: { body: 'x' }, tests: [status(403)] }),
    ...['/admin/feedback', '/admin/marketplace', '/admin/users', '/admin/copy/leaders'].map((p) =>
      req(`Non-admin ${p} → 403`, 'GET', `${B}${p}`, { as: 'a', tests: [status(403)] })),
    req('Admin can read the feedback inbox', 'GET', `${B}/admin/feedback`, { as: 'admin', tests: [status(200)] }),
  ] },

  { name: '03 Account', item: [
    req('Profile', 'GET', `${B}/me/profile`, { as: 'a', tests: [status(200), json, t('shape', "pm.expect(d).to.include({ name: 'Postman A', phone: null, twoFactorEnabled: false, hasPassword: true }); pm.expect(d.signInMethods).to.eql(['password']);")] }),
    req('Edit profile', 'PATCH', `${B}/me/profile`, { as: 'a', body: { name: 'Asha P', phone: '+919876543210', timezone: 'Asia/Kolkata' }, tests: [status(200), json, t('saved', "pm.expect(d).to.include({ name: 'Asha P', phone: '+919876543210', timezone: 'Asia/Kolkata' });")] }),
    req('Bad phone → 422', 'PATCH', `${B}/me/profile`, { as: 'a', body: { phone: '12' }, tests: [status(422)] }),
    req('Email isn’t editable here → 422', 'PATCH', `${B}/me/profile`, { as: 'a', body: { email: 'x@y.z' }, tests: [status(422)] }),
    req('Tour progress', 'PATCH', `${B}/me/tour`, { as: 'a', body: { seen: ['dashboard'] }, tests: [status(200), json, t('merged', "pm.expect(d).to.eql({ seen: ['dashboard'], dismissed: false });")] }),
    req('Activity log', 'GET', `${B}/me/activity?group=security`, { as: 'a', tests: [status(200), json, t('sign-in and profile change are there', "const k = d.items.map(i => i.kind); pm.expect(k).to.include('sign_in'); pm.expect(k).to.include('profile_updated');")] }),
    req('Plan', 'GET', `${B}/me/plan`, { as: 'a', tests: [status(200), json, t('free, with limits and what is used', "pm.expect(d.plan).to.eql('free'); pm.expect(d.limits.length).to.be.above(3); d.limits.forEach(l => pm.expect(l.used).to.be.a('number'));")] }),
    req('Data export carries no secrets', 'GET', `${B}/me/export`, { as: 'a', tests: [status(200), t('no password hashes or tokens', "const s = pm.response.text(); pm.expect(s).to.not.match(/\"password\"\\s*:\\s*\"[^\"]|session_token|apiKeyEnc|secretHash/);"), t('has the profile', "pm.expect(pm.response.text()).to.include('Asha P');")] }),
    req('Deletion check', 'GET', `${B}/me/delete`, { as: 'a', tests: [status(200), json, t('nothing blocks it', "pm.expect(d.blockers).to.eql([]);")] }),
  ] },

  { name: '04 Feedback', item: [
    req('Too short → 422', 'POST', `${B}/feedback`, { as: 'a', body: { kind: 'bug', message: 'hi' }, tests: [status(422)] }),
    req('Send a bug report', 'POST', `${B}/feedback`, { as: 'a', body: { kind: 'bug', message: 'The calendar shows the wrong day near midnight.', page: '/calendar' }, tests: [status(201), json, save('feedbackId', 'd.id')] }),
    req('Mine', 'GET', `${B}/feedback/mine`, { as: 'a', tests: [status(200), json, t('listed as new', "pm.expect(d[0]).to.include({ kind: 'bug', status: 'new' });")] }),
    req('Someone else’s inbox stays empty', 'GET', `${B}/feedback/mine`, { as: 'b', tests: [status(200), json, t('none', 'pm.expect(d).to.eql([]);')] }),
    req('Admin marks it read', 'PATCH', `${B}/admin/feedback/{{feedbackId}}`, { as: 'admin', body: { status: 'read' }, tests: [status(200)] }),
    req('Non-admin can’t', 'PATCH', `${B}/admin/feedback/{{feedbackId}}`, { as: 'a', body: { status: 'done' }, tests: [status(403)] }),
  ] },

  { name: '05 Strategies', item: [
    req('Invalid spec → 422', 'POST', `${B}/strategies`, { as: 'a', body: { name: 'Broken', spec: { nope: true } }, tests: [status(422)] }),
    req('Create', 'POST', `${B}/strategies`, { as: 'a', body: { name: 'EMA cross', spec }, tests: [status(201), json, t('version 1', 'pm.expect(d.version).to.eql(1);'), save('strategyId', 'd.id')] }),
    req('Read', 'GET', `${B}/strategies/{{strategyId}}`, { as: 'a', tests: [status(200), json, t('rules come back', "pm.expect(d.name).to.eql('EMA cross'); pm.expect(d.spec.risk.stopLoss.value).to.eql(2);")] }),
    req('Change the rules (new version)', 'PATCH', `${B}/strategies/{{strategyId}}`, { as: 'a', body: { spec: spec2, note: 'Wider stop' }, tests: [status(200), json, t('version 2', 'pm.expect(d.version).to.eql(2);')] }),
    req('Restore version 1', 'POST', `${B}/strategies/{{strategyId}}/versions/1/restore`, { as: 'a', tests: [status(200), json, t('stop back to 2%', 'pm.expect(d.spec.risk.stopLoss.value).to.eql(2);')] }),
    req('Duplicate', 'POST', `${B}/strategies/{{strategyId}}/duplicate`, { as: 'a', tests: [status(201), json, t('a separate copy', "pm.expect(d.id).to.not.eql(pm.collectionVariables.get('strategyId'));"), save('copyId', 'd.id')] }),
    req('Listed', 'GET', `${B}/strategies`, { as: 'a', tests: [status(200), json, t('both there', "const ids = d.map(s => s.id); pm.expect(ids).to.include(pm.collectionVariables.get('strategyId')); pm.expect(ids).to.include(pm.collectionVariables.get('copyId'));")] }),
    req('Archive the copy', 'PATCH', `${B}/strategies/{{copyId}}`, { as: 'a', body: { status: 'archived' }, tests: [status(200), json, t('archived', "pm.expect(d.status).to.eql('archived');")] }),
    req('Rule check', 'POST', `${B}/strategies/inspect`, { as: 'a', body: spec, tests: [status(200), json, t('no blockers, and a plain-English read-back', "pm.expect(d.validation.blockers).to.eql([]); pm.expect(d.readback).to.be.ok;")] }),
    req('Someone else reading it → 404', 'GET', `${B}/strategies/{{strategyId}}`, { as: 'b', tests: [status(404)] }),
    req('Someone else editing it → 404', 'PATCH', `${B}/strategies/{{strategyId}}`, { as: 'b', body: { name: 'Mine now' }, tests: [status(404)] }),
    req('Someone else’s list doesn’t show it', 'GET', `${B}/strategies`, { as: 'b', tests: [status(200), json, t('absent', "pm.expect(d.map(s => s.id)).to.not.include(pm.collectionVariables.get('strategyId'));")] }),
  ] },

  { name: '06 Paper runs', item: [
    req('Live without an account → 422', 'POST', `${B}/strategies/{{strategyId}}/deployments`, { as: 'a', body: { mode: 'live' }, tests: ["pm.test('refused', () => pm.expect(pm.response.code).to.be.oneOf([403, 409, 422]));"] }),
    req('Start on paper', 'POST', `${B}/strategies/{{strategyId}}/deployments`, { as: 'a', body: { mode: 'paper', capital: 1000 }, tests: [status(201), json, t('running', "pm.expect(d.status).to.eql('running'); pm.expect(d.mode).to.eql('paper');"), save('deploymentId', 'd.id')] }),
    req('Read the run', 'GET', `${B}/deployments/{{deploymentId}}`, { as: 'a', tests: [status(200), json, t('its rules and interval', "pm.expect(d.spec).to.be.an('object'); pm.expect(d.interval).to.be.a('string');")] }),
    req('Size it 2×', 'POST', `${B}/deployments/{{deploymentId}}/size`, { as: 'a', body: { multiplier: 2 }, tests: [status(200)] }),
    req('Bad size → 422', 'POST', `${B}/deployments/{{deploymentId}}/size`, { as: 'a', body: { multiplier: 50 }, tests: [status(422)] }),
    req('Pause', 'POST', `${B}/deployments/{{deploymentId}}/pause`, { as: 'a', tests: [status(200), json, t('paused', "pm.expect(d.status).to.eql('paused');")] }),
    req('Resume', 'POST', `${B}/deployments/{{deploymentId}}/resume`, { as: 'a', tests: [status(200), json, t('running', "pm.expect(d.status).to.eql('running');")] }),
    req('Unknown action → 404', 'POST', `${B}/deployments/{{deploymentId}}/explode`, { as: 'a', tests: [status(404)] }),
    req('Someone else stopping it → 404', 'POST', `${B}/deployments/{{deploymentId}}/stop`, { as: 'b', tests: [status(404)] }),
    req('Stop', 'POST', `${B}/deployments/{{deploymentId}}/stop`, { as: 'a', tests: [status(200), json, t('stopping (the next tick settles it; the scheduler is off here)', "pm.expect(d.status).to.be.oneOf(['stopping', 'stopped']);")] }),
    req('Runs of the strategy', 'GET', `${B}/strategies/{{strategyId}}/deployments`, { as: 'a', tests: [status(200), json, t('listed', "pm.expect(d.map(x => x.id)).to.include(pm.collectionVariables.get('deploymentId'));")] }),
    req('Report', 'GET', `${B}/deployments/report?mode=paper&days=30`, { as: 'a', tests: [status(200)] }),
    req('Activity shows start, size, pause and stop', 'GET', `${B}/me/activity?group=trading`, { as: 'a', tests: [status(200), json, t('in order', "const k = d.items.map(i => i.kind); ['deployment_started', 'deployment_changed', 'deployment_stopped'].forEach(x => pm.expect(k).to.include(x));")] }),
  ] },

  { name: '07 Marketplace', item: [
    req('Browse', 'GET', `${B}/marketplace`, { as: 'b', tests: [status(200)] }),
    req('Not a creator yet', 'GET', `${B}/marketplace/creator`, { as: 'a', tests: [status(200)] }),
    req('Short bio → 422', 'POST', `${B}/marketplace/creator`, { as: 'a', body: { displayName: 'Asha', bio: 'short' }, tests: [status(422)] }),
    req('Apply as a creator', 'POST', `${B}/marketplace/creator`, { as: 'a', body: { displayName: 'Asha P', bio: 'Trend following on BTC with small, fixed risk.' }, tests: [status(200), json, t('pending review', "pm.expect(d.status).to.eql('pending');")] }),
    req('Publishing before approval → 403', 'POST', `${B}/marketplace/templates`, { as: 'a', body: { strategyId: '{{strategyId}}', name: 'EMA cross', summary: 'A simple EMA crossover with a 2% stop.', description: 'Buys when the 9 EMA crosses the 21 EMA, risks 2% and takes 2R.', category: 'trend', risk: 'low', params: [], exchanges: ['delta_india'] }, tests: [status(403)] }),
    req('Admin queue has the application', 'GET', `${B}/admin/marketplace?status=pending`, { as: 'admin', tests: [status(200), t('listed', "pm.expect(pm.response.text()).to.include('Asha P');")] }),
    req('My subscriptions', 'GET', `${B}/marketplace/subscriptions`, { as: 'b', tests: [status(200), json, t('none', 'pm.expect(d).to.eql([]);')] }),
    req('Missing template → 404', 'GET', `${B}/marketplace/cm0000000000000000000000x`, { as: 'b', tests: [status(404)] }),
  ] },

  { name: '08 Alerts, screens and journal', item: [
    req('Price alert', 'POST', `${B}/alerts`, { as: 'a', body: { symbol: 'BTCUSDT', direction: 'above', threshold: 1_000_000, note: 'moon' }, tests: [status(201), json, save('alertId', 'd.id')] }),
    req('Price alert on someone else’s account → 404', 'POST', `${B}/alerts`, { as: 'a', body: { symbol: 'EURUSD', direction: 'above', threshold: 2, accountId: 'cm0000000000000000000000x' }, tests: [status(404)] }),
    req('Edit it', 'PATCH', `${B}/alerts/{{alertId}}`, { as: 'a', body: { note: 'later' }, tests: [status(200), json, t('saved', "pm.expect(d.note).to.eql('later');")] }),
    req('Someone else deleting it → 404', 'DELETE', `${B}/alerts/{{alertId}}`, { as: 'b', tests: [status(404)] }),
    req('Delete it', 'DELETE', `${B}/alerts/{{alertId}}`, { as: 'a', tests: [status(200)] }),
    req('Delete again → 404', 'DELETE', `${B}/alerts/{{alertId}}`, { as: 'a', tests: [status(404)] }),
    req('Indicator catalogue', 'GET', `${B}/indicator-alerts/catalogue`, { as: 'a', tests: [status(200)] }),
    req('Watch rules', 'GET', `${B}/indicator-alerts/watch-rules`, { as: 'a', tests: [status(200), json, t('each says what it is, why it matters and the catch', "pm.expect(d.length).to.be.above(10); d.forEach(r => { pm.expect(r.explain.what).to.be.a('string'); pm.expect(r.explain.why).to.be.a('string'); pm.expect(r.explain.caution).to.be.a('string'); });")] }),
    req('Unknown rule → 404', 'POST', `${B}/indicator-alerts/watch`, { as: 'a', body: { ruleId: 'nope', symbol: 'BTCUSDT' }, tests: [status(404)] }),
    req('Bad symbol → 422', 'POST', `${B}/indicator-alerts/watch`, { as: 'a', body: { ruleId: 'rsi-oversold', symbol: 'BTC/USDT!' }, tests: [status(422)] }),
    req('Save a screen', 'POST', `${B}/screener/screens`, { as: 'a', body: { name: 'Trend', definition: { timeframe: '1h', universe: 50, groups: [] } }, tests: [status(201), json, save('screenId', 'd.id')] }),
    req('Rename it', 'PATCH', `${B}/screener/screens/{{screenId}}`, { as: 'a', body: { name: 'Trend 1h' }, tests: [status(200), json, t('renamed', "pm.expect(d.name).to.eql('Trend 1h');")] }),
    req('Someone else renaming it → 404', 'PATCH', `${B}/screener/screens/{{screenId}}`, { as: 'b', body: { name: 'Mine' }, tests: [status(404)] }),
    req('Delete the screen', 'DELETE', `${B}/screener/screens/{{screenId}}`, { as: 'a', tests: [status(200)] }),
    req('Journal entry', 'POST', `${B}/journal`, { as: 'a', body: { body: 'Waited for the retest. Good trade.', tags: ['patience'] }, tests: [status(201), json, save('journalId', 'd.id')] }),
    req('Journal entry on someone else’s account → 404', 'POST', `${B}/journal`, { as: 'a', body: { body: 'x', brokerAccountId: 'cm0000000000000000000000x' }, tests: [status(404)] }),
    req('Edit the entry', 'PATCH', `${B}/journal/{{journalId}}`, { as: 'a', body: { body: 'Waited for the retest. Great trade.' }, tests: [status(200)] }),
    req('Someone else editing it → 404', 'PATCH', `${B}/journal/{{journalId}}`, { as: 'b', body: { body: 'mine' }, tests: [status(404)] }),
    req('Delete the entry', 'DELETE', `${B}/journal/{{journalId}}`, { as: 'a', tests: [status(200)] }),
  ] },

  { name: '09 Trading desk and API keys', item: [
    req('Desk with no exchange accounts', 'GET', `${B}/trading/overview`, { as: 'a', tests: [status(200), json, t('empty, not an error', 'pm.expect(d.positions).to.eql([]); pm.expect(d.errors).to.eql([]);')] }),
    req('Orders', 'GET', `${B}/trading/orders`, { as: 'a', tests: [status(200), json, t('none', 'pm.expect(d.items).to.eql([]);')] }),
    req('Bad filter → 422', 'GET', `${B}/trading/orders?status=weird`, { as: 'a', tests: [status(422)] }),
    req('Summary', 'GET', `${B}/trading/orders/summary`, { as: 'a', tests: [status(200)] }),
    req('CSV export', 'GET', `${B}/trading/orders/export.csv`, { as: 'a', tests: [status(200), t('a CSV file', "pm.expect(pm.response.headers.get('Content-Type')).to.match(/^text\\/csv/); pm.expect(pm.response.headers.get('Content-Disposition')).to.match(/attachment/);")] }),
    req('Order on an account that isn’t yours → 404', 'POST', `${B}/trading/orders`, { as: 'a', body: { connectionId: 'cm0000000000000000000000x', symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 1 }, requestId: 'postman-order-1' }, tests: [status(404)] }),
    req('Webhook not set up', 'GET', `${B}/trading/webhook`, { as: 'a', tests: [status(200), json, t('null', 'pm.expect(d).to.eql(null);')] }),
    req('Make a read-only API key', 'POST', `${B}/trading/api-keys`, { as: 'a', body: { name: 'Postman', scope: 'read' }, tests: [status(201), json, t('the key is shown once', "pm.expect(d.key).to.match(/^tl_/); pm.expect(d.scope).to.eql('read');"), save('apiKey', 'd.key'), save('apiKeyId', 'd.id')] }),
    req('Key list never shows the key', 'GET', `${B}/trading/api-keys`, { as: 'a', tests: [status(200), t('no secret in the list', "pm.expect(pm.response.text()).to.not.include(pm.collectionVariables.get('apiKey'));")] }),
    req('/v1 without a key → 401', 'GET', `${B}/v1/accounts`, { origin: false, tests: [status(401)] }),
    req('/v1 accounts with the key', 'GET', `${B}/v1/accounts`, { origin: false, headers: [{ key: 'Authorization', value: 'Bearer {{apiKey}}' }], tests: [status(200), json, t('none yet', 'pm.expect(d).to.eql([]);')] }),
    req('/v1 orders with the key', 'GET', `${B}/v1/orders`, { origin: false, headers: [{ key: 'Authorization', value: 'Bearer {{apiKey}}' }], tests: [status(200)] }),
    req('A read key can’t trade → 403', 'POST', `${B}/v1/orders`, { origin: false, headers: [{ key: 'Authorization', value: 'Bearer {{apiKey}}' }], body: { connectionId: 'x', symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 1 }, requestId: 'postman-order-2' }, tests: [status(403)] }),
    req('Someone else revoking it → 404', 'POST', `${B}/trading/api-keys/{{apiKeyId}}/revoke`, { as: 'b', tests: [status(404)] }),
    req('Revoke it', 'POST', `${B}/trading/api-keys/{{apiKeyId}}/revoke`, { as: 'a', tests: [status(200), json, t('revoked', 'pm.expect(d.revokedAt).to.be.a("string");')] }),
    req('/v1 with the revoked key → 401', 'GET', `${B}/v1/accounts`, { origin: false, headers: [{ key: 'Authorization', value: 'Bearer {{apiKey}}' }], tests: [status(401)] }),
  ] },

  { name: '10 Exchanges, copy trading and options', item: [
    req('Exchange catalogue', 'GET', `${B}/exchanges/catalog`, { as: 'a', tests: [status(200), t('Delta India is there', "pm.expect(pm.response.text()).to.include('DELTA_INDIA');")] }),
    req('No accounts yet', 'GET', `${B}/exchanges`, { as: 'a', tests: [status(200), json, t('none', 'pm.expect(d).to.eql([]);')] }),
    req('Connect without keys → 422', 'POST', `${B}/exchanges`, { as: 'a', body: { exchange: 'DELTA_INDIA' }, tests: [status(422)] }),
    req('Leaderboard', 'GET', `${B}/leaders`, { as: 'a', tests: [status(200)] }),
    req('No copies yet', 'GET', `${B}/follows`, { as: 'a', tests: [status(200), json, t('none', 'pm.expect(d).to.eql([]);')] }),
    req('Copying without accepting the risk → 422', 'POST', `${B}/follows`, { as: 'a', body: { leaderId: 'x', connectionId: 'y' }, tests: [status(422)] }),
    req('Copying a leader that isn’t there → 404', 'POST', `${B}/follows`, { as: 'a', body: { leaderId: 'cm0000000000000000000000x', connectionId: 'cm0000000000000000000000y', riskAccepted: true, riskVersion: COPY_RISK_VERSION }, tests: [status(404)] }),
    req('Option strategy templates', 'GET', `${B}/options/templates`, { as: 'a', tests: [status(200), json, t('several', 'pm.expect(d.length).to.be.above(3);')] }),
    req('Option order on an account that isn’t yours → 404', 'POST', `${B}/options/orders/preview`, { as: 'a', body: { connectionId: 'cm0000000000000000000000x', requestId: 'postman-opt-1', underlying: 'BTC', legs: [{ kind: 'call', side: 1, qty: 1, strike: 100000, expiry: '311226' }] }, tests: [status(404)] }),
  ] },
];

const collection = {
  info: {
    name: 'TRADElogs — Trading platform',
    description: 'Contract tests for account, feedback, strategies and paper runs, marketplace, alerts and screens, journal, trading desk and API keys, exchanges, copy trading and options. Run with apps/api/postman/run-trading.sh against the local test API; nothing here calls an exchange, market data or AI.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: folders,
  variable: [
    { key: 'baseUrl', value: 'http://localhost:4200' },
    { key: 'appUrl', value: 'http://localhost:3040' },
    { key: 'password', value: 'Postman-trading-12345' },
    { key: 'aEmail', value: '' }, { key: 'bEmail', value: '' }, { key: 'adminEmail', value: 'admin@trading.test' }, { key: 'adminPassword', value: '' },
    ...Object.values(AUTH).map((key) => ({ key, value: '' })),
  ],
};

writeFileSync(path.join(dir, 'trading-platform.postman_collection.json'), `${JSON.stringify(collection, null, 2)}\n`);
console.log(`wrote ${folders.reduce((n, f) => n + f.item.length, 0)} requests in ${folders.length} folders`);
