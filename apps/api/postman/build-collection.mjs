// Generates partners.postman_collection.json (Postman v2.1). Run: node build-collection.mjs
// Every request disables Postman's cookie jar; cookies are sent explicitly so each
// attribution scenario is deterministic.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const AUTH = { admin: 'adminCookie', rohan: 'rohanCookie', sana: 'sanaCookie', nina: 'ninaCookie', c1: 'c1Cookie' };
const FB = 'http://127.0.0.1:8999';

function req(name, method, url, { body, as, cookie, tests = [], pre = [], origin = false, query, headers: extra = [] } = {}) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  const jar = [];
  if (as) jar.push(`{{${AUTH[as]}}}`);
  if (cookie) jar.push(cookie);
  if (jar.length) headers.push({ key: 'Cookie', value: jar.join('; ') });
  if (origin) headers.push({ key: 'Origin', value: '{{appUrl}}' });
  headers.push(...extra);
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
      ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
    },
  };
}

const status = c => `pm.test('status ${c}', () => pm.response.to.have.status(${c}));`;
const code = c => `pm.test('error code ${c}', () => pm.expect(pm.response.json().error.code).to.eql('${c}'));`;
const t = (label, expr) => `pm.test(${JSON.stringify(label)}, () => { ${expr} });`;
const json = 'const d = pm.response.json().data;';
const setCookieOf = name => `(pm.response.headers.all().filter(h => h.key.toLowerCase() === 'set-cookie').map(h => h.value).find(v => v.startsWith('${name}=')) || '').split(';')[0]`;

const signup = (key, extra = {}, cookie) => req(`Sign up ${key}`, 'POST', '{{baseUrl}}/api/auth/sign-up/email', {
  origin: true, cookie,
  body: { email: `{{${key}Email}}`, password: '{{password}}', name: `{{${key}Name}}`, country: 'IN', city: 'Mumbai', postalCode: '400001', ...extra },
  tests: [status(200)],
});
const signin = key => req(`Sign in ${key}`, 'POST', '{{altUrl}}/api/auth/sign-in/email', {
  origin: true, body: { email: `{{${key}Email}}`, password: '{{password}}' },
  tests: [status(200), `const c = ${setCookieOf('better-auth.session_token')};`, t('session cookie issued', 'pm.expect(c).to.match(/^better-auth\\.session_token=/);'), `pm.collectionVariables.set('${AUTH[key]}', c);`],
});
const click = (name, path, { cookie, expectCookie, saveAs, expectHome = false } = {}) => req(name, 'GET', `{{altUrl}}/api/r/${path.split('?')[0]}`, {
  cookie, query: path.split('?')[1],
  tests: [
    status(302),
    expectHome
      ? t('redirects home', "pm.expect(pm.response.headers.get('Location')).to.eql(pm.variables.get('appUrl') + '/');")
      : t('redirects to signup with the code', "pm.expect(pm.response.headers.get('Location')).to.match(/\\/signup\\?ref=[A-Z0-9_-]+$/);"),
    `const c = ${setCookieOf('tl_ref')};`,
    expectCookie
      ? t('sets a signed tl_ref cookie', "pm.expect(c).to.match(/^tl_ref=[^.]+\\.[^.]+\\.\\d+\\.[A-Za-z0-9_-]+$/);")
      : t('does not set tl_ref', 'pm.expect(c).to.eql("");'),
    ...(saveAs ? [`pm.collectionVariables.set('${saveAs}', c);`] : []),
    ...(expectCookie ? [t('cookie is HttpOnly + Lax', "const raw = pm.response.headers.all().find(h => h.key.toLowerCase()==='set-cookie' && h.value.startsWith('tl_ref=')).value; pm.expect(raw).to.include('HttpOnly'); pm.expect(raw).to.match(/SameSite=Lax/i);")] : []),
  ],
});

const B = '{{baseUrl}}/api';
const folders = [
  { name: '01 Bootstrap users', item: [signup('admin'), signup('rohan'), signup('sana'), signup('nina')] },

  { name: '02 Partner setup', item: [
    signin('admin'), signin('rohan'), signin('sana'), signin('nina'),
    req('Unauthenticated portal → 401', 'GET', `${B}/partner/overview`, { tests: [status(401)] }),
    req('Non-partner /me → null', 'GET', `${B}/partner/me`, { as: 'rohan', tests: [status(200), t('data is null', 'pm.expect(pm.response.json().data).to.eql(null);')] }),
    req('Non-partner overview → 403 NOT_A_PARTNER', 'GET', `${B}/partner/overview`, { as: 'rohan', tests: [status(403), code('NOT_A_PARTNER')] }),
    req('Non-admin admin list → 403', 'GET', `${B}/admin/partners`, { as: 'rohan', tests: [status(403)] }),
    req('Admin creates Rohan (ROHANFX)', 'POST', `${B}/admin/partners`, { as: 'admin', body: { email: '{{rohanEmail}}', code: 'rohanfx', audience: 'Telegram · 18k members' },
      tests: [status(201), json, t('active with requested code', "pm.expect(d.status).to.eql('ACTIVE'); pm.expect(d.code).to.eql('ROHANFX'); pm.expect(d.approvedAt).to.be.a('string');"),
        t('zero counters', 'pm.expect([d.clicks30d,d.signups30d,d.clients,d.connected,d.active]).to.eql([0,0,0,0,0]);'), "pm.collectionVariables.set('rohanPid', d.id);"] }),
    req('Admin creates Rohan again → 409', 'POST', `${B}/admin/partners`, { as: 'admin', body: { email: '{{rohanEmail}}' }, tests: [status(409)] }),
    req('Admin creates unknown email → 404', 'POST', `${B}/admin/partners`, { as: 'admin', body: { email: 'ghost@partners.test' }, tests: [status(404)] }),
    req('Admin creates with reserved code → 409', 'POST', `${B}/admin/partners`, { as: 'admin', body: { email: '{{ninaEmail}}', code: 'TRADELOGSVIP' }, tests: [status(409)] }),
    req('Admin creates with bad code → 422', 'POST', `${B}/admin/partners`, { as: 'admin', body: { email: '{{ninaEmail}}', code: 'ab' }, tests: [status(422)] }),
    req('Sana applies (SANA)', 'POST', `${B}/partner/apply`, { as: 'sana', body: { audience: 'YouTube · 42k', code: 'sana' },
      tests: [status(201), json, t('pending with code', "pm.expect(d.status).to.eql('PENDING'); pm.expect(d.code).to.eql('SANA');"), "pm.collectionVariables.set('sanaPid', d.id);"] }),
    req('Sana applies again → 409', 'POST', `${B}/partner/apply`, { as: 'sana', body: { audience: 'YouTube' }, tests: [status(409)] }),
    req('Pending partner overview → 403 PARTNER_PENDING', 'GET', `${B}/partner/overview`, { as: 'sana', tests: [status(403), code('PARTNER_PENDING')] }),
    req('Pending code does not attribute', 'GET', `${B}/referrals/check`, { query: 'code=SANA', tests: [status(200), t('invalid while pending', 'pm.expect(pm.response.json().data).to.eql({ valid: false, partnerName: null });')] }),
    req('Code check (case-insensitive) shows first name only', 'GET', `${B}/referrals/check`, { query: 'code=rohanfx', tests: [status(200), t('valid, first name', "pm.expect(pm.response.json().data).to.eql({ valid: true, partnerName: pm.collectionVariables.get('rohanName').split(' ')[0] });")] }),
    req('Code check without code → 422', 'GET', `${B}/referrals/check`, { tests: [status(422)] }),
    req('Admin list shows pending Sana', 'GET', `${B}/admin/partners`, { as: 'admin', tests: [status(200), json, t('both listed', "const s = d.find(p => p.id === pm.collectionVariables.get('sanaPid')); pm.expect(s.status).to.eql('PENDING'); pm.expect(d.some(p => p.code === 'ROHANFX')).to.be.true;")] }),
    req('Admin approves Sana', 'POST', `${B}/admin/partners/{{sanaPid}}/status`, { as: 'admin', body: { action: 'approve', reason: 'Verified channel' }, tests: [status(200), t('active', "pm.expect(pm.response.json().data.status).to.eql('ACTIVE');")] }),
    req('Approve twice → 409', 'POST', `${B}/admin/partners/{{sanaPid}}/status`, { as: 'admin', body: { action: 'approve' }, tests: [status(409)] }),
    req('Bad status action → 422', 'POST', `${B}/admin/partners/{{sanaPid}}/status`, { as: 'admin', body: { action: 'delete' }, tests: [status(422)] }),
    req('Rohan /me → ACTIVE profile', 'GET', `${B}/partner/me`, { as: 'rohan', tests: [status(200), json, t('profile', "pm.expect(d.code).to.eql('ROHANFX'); pm.expect(d.status).to.eql('ACTIVE'); pm.expect(d.cookieDays).to.be.above(0); pm.expect(d.activeRule.minTrades).to.be.above(0);")] }),
    req('Access status carries partnerStatus', 'GET', `${B}/access/status`, { as: 'rohan', tests: [status(200), t('ACTIVE', "pm.expect(pm.response.json().data.partnerStatus).to.eql('ACTIVE');")] }),
    req('Access status null for non-partner', 'GET', `${B}/access/status`, { as: 'nina', tests: [status(200), t('null', 'pm.expect(pm.response.json().data.partnerStatus).to.eql(null);')] }),
    req('Rohan adds channel "Telegram group"', 'POST', `${B}/partner/channels`, { as: 'rohan', body: { label: 'Telegram group' },
      tests: [status(201), json, t('slugged link', "pm.expect(d.slug).to.eql('telegram-group'); pm.expect(d.url).to.match(/\\/r\\/ROHANFX\\?ch=telegram-group$/);"), "pm.collectionVariables.set('tgChannelId', d.id);"] }),
    req('Same label again gets a unique slug', 'POST', `${B}/partner/channels`, { as: 'rohan', body: { label: 'Telegram group' },
      tests: [status(201), t('slug -2', "pm.expect(pm.response.json().data.slug).to.eql('telegram-group-2');"), "pm.collectionVariables.set('tg2ChannelId', pm.response.json().data.id);"] }),
    req('Empty channel label → 422', 'POST', `${B}/partner/channels`, { as: 'rohan', body: { label: '' }, tests: [status(422)] }),
    req('Rohan reserves custom code rohan-vip', 'POST', `${B}/partner/codes`, { as: 'rohan', body: { code: 'rohan-vip' },
      tests: [status(201), json, t('upper-cased, not primary', "pm.expect(d.code).to.eql('ROHAN-VIP'); pm.expect(d.isPrimary).to.be.false;"), "pm.collectionVariables.set('vipCodeId', d.id);"] }),
    req('Taken code → 409', 'POST', `${B}/partner/codes`, { as: 'rohan', body: { code: 'SANA' }, tests: [status(409)] }),
    req('Reserved word → 409', 'POST', `${B}/partner/codes`, { as: 'rohan', body: { code: 'admin' }, tests: [status(409)] }),
    req('Illegal code → 422', 'POST', `${B}/partner/codes`, { as: 'rohan', body: { code: 'has space' }, tests: [status(422)] }),
    req('Rohan links', 'GET', `${B}/partner/links`, { as: 'rohan', tests: [status(200), json,
      t('base url + codes', "pm.expect(d.baseUrl).to.match(/\\/r\\/ROHANFX$/); pm.expect(d.codes.map(c => c.code)).to.eql(['ROHANFX','ROHAN-VIP']); pm.expect(d.codes[0].isPrimary).to.be.true;"),
      t('default + two channels', "pm.expect(d.channels).to.have.length(3); const def = d.channels.find(c => c.slug === null); pm.expect(def.label).to.eql('Direct link'); pm.collectionVariables.set('defaultChannelId', def.id);"),
      t('limits', 'pm.expect(d.limits.maxChannels).to.be.above(0); pm.expect(d.limits.maxCodes).to.be.above(1);')] }),
  ] },

  { name: '03 Attribution', item: [
    click('Click ROHANFX via telegram channel', 'ROHANFX?ch=telegram-group', { expectCookie: true, saveAs: 'refA' }),
    click('Second link while cookie valid → first click wins', 'SANA', { cookie: '{{refA}}', expectCookie: false }),
    click('Click custom code (lower-case)', 'rohan-vip', { expectCookie: true, saveAs: 'refB' }),
    click('Click ROHANFX again (fresh visitor)', 'ROHANFX', { expectCookie: true, saveAs: 'refC' }),
    click('Unknown code → home, no cookie', 'NOPE123', { expectCookie: false, expectHome: true }),
    click('Unknown channel falls back to default link', 'ROHANFX?ch=does-not-exist', { expectCookie: true, saveAs: 'refD' }),
    click('Click ROHANFX via telegram (for pre-filled code)', 'ROHANFX?ch=telegram-group', { expectCookie: true, saveAs: 'refE' }),
    signup('c1', {}, '{{refA}}'),
    signup('c2', { referralCode: 'sana' }, '{{refB}}'),
    signup('c3', { referralCode: 'ZZZNOPE' }, '{{refB}}'),
    signup('c4', {}, '{{refA}}'),
    signup('c5'),
    signup('c7', { referralCode: 'rohanfx' }, '{{refE}}'),
    req('Sign up c6 (tampered cookie)', 'POST', '{{baseUrl}}/api/auth/sign-up/email', { origin: true,
      pre: ["const c = pm.collectionVariables.get('refC'); pm.collectionVariables.set('refCBad', c.slice(0, -2) + (c.endsWith('AA') ? 'BB' : 'AA'));"],
      cookie: '{{refCBad}}', body: { email: '{{c6Email}}', password: '{{password}}', name: '{{c6Name}}', country: 'IN', city: 'Pune', postalCode: '411001' }, tests: [status(200)] }),
  ] },

  { name: '04 Portal reads', item: [
    req('Rohan overview (ALL)', 'GET', `${B}/partner/overview`, { as: 'rohan', query: 'range=ALL', tests: [status(200), json,
      t('funnel', 'pm.expect(d.funnel).to.include({ range: "ALL", from: null, clicks: 5, converted: 3, signups: 3, connected: 1, active: 0 });'),
      t('three clients, newest first', "pm.expect(d.totalClients).to.eql(3); pm.expect(d.recentClients.map(c => c.name)).to.eql([pm.collectionVariables.get('c7Name'), pm.collectionVariables.get('c3Name'), pm.collectionVariables.get('c1Name')]);"),
      t('pre-filled code for the same partner keeps the link + channel', "const c7 = d.recentClients.find(c => c.name === pm.collectionVariables.get('c7Name')); pm.expect(c7).to.include({ via: 'link', channel: 'Telegram group' });"),
      t('c1 came through the telegram link and connected', "const c1 = d.recentClients.find(c => c.name === pm.collectionVariables.get('c1Name')); pm.expect(c1).to.include({ channel: 'Telegram group', via: 'link', status: 'CONNECTED', city: 'Mumbai', country: 'IN' }); pm.expect(c1.connectedAt).to.be.a('string');"),
      t('c3 fell back to the cookie (ROHAN-VIP) despite a bad typed code', "const c3 = d.recentClients.find(c => c.name === pm.collectionVariables.get('c3Name')); pm.expect(c3).to.include({ via: 'link', status: 'SIGNED_UP', channel: 'Direct link' });"),
      t('no emails leak to partners', "pm.expect(JSON.stringify(d.recentClients)).to.not.include('@');"),
      t('channels', "const tg = d.channels.find(c => c.slug === 'telegram-group'); pm.expect(tg).to.include({ clicks: 2, converted: 2, signups: 2, connected: 1 }); const def = d.channels.find(c => c.slug === null); pm.expect(def).to.include({ clicks: 3, signups: 1 });"),
      t('daily series ends today with running totals', "const last = d.daily[d.daily.length - 1]; pm.expect(last.date).to.eql(new Date().toISOString().slice(0,10)); pm.expect(last.clients).to.eql(3); pm.expect(d.daily.reduce((s,p) => s + p.clicks, 0)).to.eql(5);"),
      t('activity feed has signup + connected events', "const kinds = d.activity.map(e => e.kind); pm.expect(kinds).to.include('signup'); pm.expect(kinds).to.include('connected');")] }),
    req('Rohan overview bad range → 422', 'GET', `${B}/partner/overview`, { as: 'rohan', query: 'range=1Y', tests: [status(422)] }),
    req('Rohan clients', 'GET', `${B}/partner/clients`, { as: 'rohan', tests: [status(200),
      t('items + counts + meta', "const b = pm.response.json(); pm.expect(b.data.items).to.have.length(3); pm.expect(b.data.counts).to.eql({ all: 3, SIGNED_UP: 2, CONNECTED: 1, ACTIVE: 0, INACTIVE: 0 }); pm.expect(b.meta).to.eql({ page: 1, pageSize: 12, total: 3, totalPages: 1 });"),
      "pm.collectionVariables.set('c1RefId', pm.response.json().data.items.find(c => c.name === pm.collectionVariables.get('c1Name')).id);"] }),
    req('Clients filtered CONNECTED', 'GET', `${B}/partner/clients`, { as: 'rohan', query: 'status=CONNECTED', tests: [status(200), t('only c1', "pm.expect(pm.response.json().data.items.map(c => c.name)).to.eql([pm.collectionVariables.get('c1Name')]);")] }),
    req('Clients search by name', 'GET', `${B}/partner/clients`, { as: 'rohan', query: 'q={{c3First}}', tests: [status(200), t('only c3', "pm.expect(pm.response.json().meta.total).to.eql(1);")] }),
    req('Clients by channel', 'GET', `${B}/partner/clients`, { as: 'rohan', query: 'channel={{tgChannelId}}', tests: [status(200), t('c1 + c7', 'pm.expect(pm.response.json().meta.total).to.eql(2);')] }),
    req('Clients paging', 'GET', `${B}/partner/clients`, { as: 'rohan', query: 'pageSize=2&page=2&sort=name', tests: [status(200), t('page 2 of 2', "const b = pm.response.json(); pm.expect(b.meta).to.include({ page: 2, totalPages: 2, total: 3 }); pm.expect(b.data.items).to.have.length(1);")] }),
    req('Clients bad status → 422', 'GET', `${B}/partner/clients`, { as: 'rohan', query: 'status=VIP', tests: [status(422)] }),
    req('Rohan links after clicks', 'GET', `${B}/partner/links`, { as: 'rohan', tests: [status(200), json,
      t('per-code stats', "const m = Object.fromEntries(d.codes.map(c => [c.code, c])); pm.expect(m.ROHANFX).to.include({ clicks: 4, signups: 2 }); pm.expect(m['ROHAN-VIP']).to.include({ clicks: 1, signups: 1 });"),
      t('totals cover every code', 'pm.expect(d.totals).to.eql({ clicks: 5, converted: 3, signups: 3 });'),
      t('recent clicks: 5, three converted', 'pm.expect(d.recentClicks).to.have.length(5); pm.expect(d.recentClicks.filter(c => c.converted)).to.have.length(3); pm.expect(d.recentClicks[0].device).to.be.oneOf(["Desktop","Mobile","Tablet"]);')] }),
    req('Sana overview — typed code beat the cookie', 'GET', `${B}/partner/overview`, { as: 'sana', query: 'range=30D', tests: [status(200), json,
      t('code signup counts as a client but not a click conversion', "pm.expect(d.funnel.converted).to.eql(0); pm.expect(d.funnel.signups).to.eql(1);"),
      t('one client via code', "pm.expect(d.totalClients).to.eql(1); pm.expect(d.recentClients[0]).to.include({ name: pm.collectionVariables.get('c2Name'), via: 'code', channel: 'Direct link' });"),
      t('one click recorded even though cookie was kept', 'pm.expect(d.funnel.clicks).to.eql(1);')] }),
    req('Refresh stats without token → 401', 'POST', '{{baseUrl}}/internal/partners/refresh-stats', { body: {}, tests: ["pm.test('rejected', () => pm.expect(pm.response.code).to.be.oneOf([401, 403]));"] }),
    req('Refresh stats (bridge offline → recorded as failure)', 'POST', '{{baseUrl}}/internal/partners/refresh-stats', { body: { limit: 10 }, headers: [{ key: 'x-internal-token', value: '{{internalToken}}' }], tests: [status(200), json, t('one connected client attempted', 'pm.expect(d.processed + d.failed).to.eql(1); pm.expect(d.skipped).to.be.false;')] }),
  ] },

  { name: '05 Admin operations', item: [
    req('Lookup by client email', 'GET', `${B}/admin/partners/lookup`, { as: 'admin', query: 'q={{c1Email}}', tests: [status(200), json, t('referred by Rohan', "pm.expect(d.user.email).to.eql(pm.collectionVariables.get('c1Email')); pm.expect(d.referredBy.partner.code).to.eql('ROHANFX'); pm.expect(d.referredBy.client.via).to.eql('link');")] }),
    req('Lookup by code', 'GET', `${B}/admin/partners/lookup`, { as: 'admin', query: 'q=rohan-vip', tests: [status(200), t('owner', "pm.expect(pm.response.json().data.codeOwner.code).to.eql('ROHANFX');")] }),
    req('Lookup unreferred user', 'GET', `${B}/admin/partners/lookup`, { as: 'admin', query: 'q={{c5Email}}', tests: [status(200), t('no referrer', 'const d = pm.response.json().data; pm.expect(d.user).to.not.eql(null); pm.expect(d.referredBy).to.eql(null);')] }),
    req('Admin detail Rohan', 'GET', `${B}/admin/partners/{{rohanPid}}`, { as: 'admin', query: 'range=ALL', tests: [status(200), json,
      t('row + codes + notes', "pm.expect(d.admin).to.include({ code: 'ROHANFX', clients: 3, connected: 1, clicks30d: 5, converted30d: 3 }); pm.expect(d.codes).to.have.length(2); pm.expect(d.notes.map(n => n.body)).to.include('Partner created by admin.');")] }),
    req('Admin detail unknown → 404', 'GET', `${B}/admin/partners/nope`, { as: 'admin', tests: [status(404)] }),
    req('Assign c5 to Sana', 'POST', `${B}/admin/partners/{{sanaPid}}/clients`, { as: 'admin', body: { email: '{{c5Email}}', reason: 'Signed up at a webinar' },
      tests: [status(201), json, t('via admin', "pm.expect(d.via).to.eql('admin');"), "pm.collectionVariables.set('c5RefId', d.id);"] }),
    req('Assign c1 to Sana without force → 409', 'POST', `${B}/admin/partners/{{sanaPid}}/clients`, { as: 'admin', body: { email: '{{c1Email}}' }, tests: [status(409)] }),
    req('Assign c1 to Sana with force', 'POST', `${B}/admin/partners/{{sanaPid}}/clients`, { as: 'admin', body: { email: '{{c1Email}}', force: true, reason: 'Client asked' }, tests: [status(201)] }),
    req('Partner can’t be own client', 'POST', `${B}/admin/partners/{{sanaPid}}/clients`, { as: 'admin', body: { email: '{{sanaEmail}}' }, tests: [status(409)] }),
    req('Rohan now has 2 clients', 'GET', `${B}/partner/clients`, { as: 'rohan', tests: [status(200), t('2', 'pm.expect(pm.response.json().meta.total).to.eql(2);')] }),
    req('Unlink c5 from Sana', 'DELETE', `${B}/admin/partners/{{sanaPid}}/clients/{{c5RefId}}`, { as: 'admin', query: 'reason=Duplicate', tests: [status(204)] }),
    req('Unlink again → 404', 'DELETE', `${B}/admin/partners/{{sanaPid}}/clients/{{c5RefId}}`, { as: 'admin', tests: [status(404)] }),
    req('Move all Rohan clients to Sana', 'POST', `${B}/admin/partners/{{rohanPid}}/move-clients`, { as: 'admin', body: { toPartnerId: '{{sanaPid}}', reason: 'Account merge' }, tests: [status(200), t('moved 2', 'pm.expect(pm.response.json().data.moved).to.eql(2);')] }),
    req('Move to self → 409', 'POST', `${B}/admin/partners/{{rohanPid}}/move-clients`, { as: 'admin', body: { toPartnerId: '{{rohanPid}}' }, tests: [status(409)] }),
    req('Conversion never exceeds 100% after moves', 'GET', `${B}/admin/partners`, { as: 'admin', tests: [status(200), t('converted ≤ clicks for every partner', 'pm.response.json().data.forEach(r => pm.expect(r.converted30d).to.be.at.most(r.clicks30d));')] }),
    req('Sana admin clients endpoint', 'GET', `${B}/admin/partners/{{sanaPid}}/clients`, { as: 'admin', tests: [status(200), t('4 clients', 'pm.expect(pm.response.json().data.counts.all).to.eql(4);')] }),
    req('Suspend Rohan', 'POST', `${B}/admin/partners/{{rohanPid}}/status`, { as: 'admin', body: { action: 'suspend', reason: 'Spam reports' }, tests: [status(200), t('suspended', "pm.expect(pm.response.json().data.status).to.eql('SUSPENDED');")] }),
    req('Suspended portal → 403 PARTNER_SUSPENDED', 'GET', `${B}/partner/links`, { as: 'rohan', tests: [status(403), code('PARTNER_SUSPENDED')] }),
    click('Suspended partner link → home, no cookie', 'ROHANFX', { expectCookie: false, expectHome: true }),
    req('Reinstate Rohan', 'POST', `${B}/admin/partners/{{rohanPid}}/status`, { as: 'admin', body: { action: 'reinstate' }, tests: [status(200), t('active', "pm.expect(pm.response.json().data.status).to.eql('ACTIVE');")] }),
    req('Admin revokes ROHAN-VIP', 'DELETE', `${B}/admin/partners/{{rohanPid}}/codes/{{vipCodeId}}`, { as: 'admin', tests: [status(204)] }),
    req('Revoked code no longer resolves', 'GET', `${B}/referrals/check`, { query: 'code=ROHAN-VIP', tests: [status(200), t('invalid', 'pm.expect(pm.response.json().data.valid).to.be.false;')] }),
    req('Primary code can’t be released', 'DELETE', `${B}/partner/codes/{{rohanPrimaryCodeId}}`, { as: 'rohan',
      pre: ["pm.sendRequest({ url: pm.collectionVariables.get('baseUrl') + '/api/partner/links', header: { Cookie: pm.collectionVariables.get('rohanCookie') } }, (e, r) => pm.collectionVariables.set('rohanPrimaryCodeId', r.json().data.codes[0].id));"],
      tests: [status(409)] }),
    req('Admin reserves BIGBANK', 'POST', `${B}/admin/partner-codes/reserved`, { as: 'admin', body: { code: 'bigbank', reason: 'Trademark' }, tests: [status(201), "pm.collectionVariables.set('reservedId', pm.response.json().data.id);", t('normalized', "pm.expect(pm.response.json().data.code).to.eql('BIGBANK');")] }),
    req('Reserve again → 409', 'POST', `${B}/admin/partner-codes/reserved`, { as: 'admin', body: { code: 'BIGBANK' }, tests: [status(409)] }),
    req('Reserve a held code → 409', 'POST', `${B}/admin/partner-codes/reserved`, { as: 'admin', body: { code: 'ROHANFX' }, tests: [status(409)] }),
    req('Partner can’t take a reserved name', 'POST', `${B}/partner/codes`, { as: 'rohan', body: { code: 'BigBank' }, tests: [status(409)] }),
    req('Reserved list', 'GET', `${B}/admin/partner-codes/reserved`, { as: 'admin', tests: [status(200), t('has BIGBANK', "pm.expect(pm.response.json().data.map(r => r.code)).to.include('BIGBANK');")] }),
    req('Release reserved name', 'DELETE', `${B}/admin/partner-codes/reserved/{{reservedId}}`, { as: 'admin', tests: [status(204)] }),
    req('Admin adds a note', 'POST', `${B}/admin/partners/{{rohanPid}}/notes`, { as: 'admin', body: { body: 'Called him about the spam reports.' }, tests: [status(201)] }),
    req('Note trail records every action', 'GET', `${B}/admin/partners/{{rohanPid}}`, { as: 'admin', tests: [status(200), t('suspend/reinstate/revoke/note present', "const b = pm.response.json().data.notes.map(n => n.body).join(' | '); ['Suspended. Reason: Spam reports','Reinstated.','Custom code ROHAN-VIP revoked.','Called him about the spam reports.','moved to'].forEach(s => pm.expect(b).to.include(s));")] }),
    req('Archive a channel', 'DELETE', `${B}/partner/channels/{{tg2ChannelId}}`, { as: 'rohan', tests: [status(204)] }),
    req('Archive it again → 404', 'DELETE', `${B}/partner/channels/{{tg2ChannelId}}`, { as: 'rohan', tests: [status(404)] }),
    req('Default link can’t be archived', 'DELETE', `${B}/partner/channels/{{defaultChannelId}}`, { as: 'rohan', tests: [status(409)] }),
    req('Revoke Sana', 'POST', `${B}/admin/partners/{{sanaPid}}/status`, { as: 'admin', body: { action: 'revoke', reason: 'Left programme' }, tests: [status(200), t('revoked', "pm.expect(pm.response.json().data.status).to.eql('REVOKED');")] }),
    req('Revoked partners drop off the default list', 'GET', `${B}/admin/partners`, { as: 'admin', tests: [status(200), t('Sana hidden', "pm.expect(pm.response.json().data.some(p => p.id === pm.collectionVariables.get('sanaPid'))).to.be.false;")] }),
    req('…but show with status=REVOKED', 'GET', `${B}/admin/partners`, { as: 'admin', query: 'status=REVOKED', tests: [status(200), t('Sana listed', "pm.expect(pm.response.json().data.some(p => p.id === pm.collectionVariables.get('sanaPid'))).to.be.true;")] }),
    req('Revoked partner can re-apply', 'POST', `${B}/partner/apply`, { as: 'sana', body: { audience: 'YouTube · 45k' }, tests: [status(201), t('pending again', "pm.expect(pm.response.json().data.status).to.eql('PENDING');")] }),
  ] },

  { name: '06 Trade sync (bridge offline)', item: [
    signin('c1'), signin('rohan'),
    req('Accounts list shows sync fields', 'GET', `${B}/accounts`, { as: 'c1', tests: [status(200), json,
      t('one account, never synced', "pm.expect(d).to.have.length(1); pm.expect(d[0]).to.include({ lastSyncAt: null, lastSyncError: null, lastDealAt: null }); pm.collectionVariables.set('c1AccId', d[0].id);")] }),
    req('First load tries the backfill → clear 502', 'GET', `${B}/trades`, { as: 'c1', query: 'accountId={{c1AccId}}', tests: [status(502), code('BROKER_CONNECTION_ERROR'),
      t('fails fast (bridge refused, no hang)', 'pm.expect(pm.response.responseTime).to.be.below(5000);')] }),
    req('Failure recorded on the account', 'GET', `${B}/accounts`, { as: 'c1', tests: [status(200), t('lastSyncError set', 'pm.expect(pm.response.json().data[0].lastSyncError).to.be.a("string").and.not.empty;')] }),
    req('During back-off reads fail fast without the bridge', 'GET', `${B}/trades/stats`, { as: 'c1', query: 'accountId={{c1AccId}}', tests: [status(502), t('under 500ms', 'pm.expect(pm.response.responseTime).to.be.below(500);')] }),
    req('Sync now overrides the back-off and reports the bridge error', 'POST', `${B}/accounts/{{c1AccId}}/sync`, { as: 'c1', body: {}, tests: [status(502), code('BROKER_CONNECTION_ERROR')] }),
    req('Another user gets 404, not 500', 'GET', `${B}/trades`, { as: 'rohan', query: 'accountId={{c1AccId}}', tests: [status(404), code('NOT_FOUND')] }),
    req('Sync now on someone else’s account → 404', 'POST', `${B}/accounts/{{c1AccId}}/sync`, { as: 'rohan', body: {}, tests: [status(404)] }),
    req('Internal sync run without token → rejected', 'POST', '{{baseUrl}}/internal/sync/run', { body: {}, tests: ["pm.test('rejected', () => pm.expect(pm.response.code).to.be.oneOf([401, 403]));"] }),
    req('Internal sync run queues due accounts', 'POST', '{{baseUrl}}/internal/sync/run', { body: { limit: 5 }, headers: [{ key: 'x-internal-token', value: '{{internalToken}}' }],
      tests: [status(200), json, t('queue stats', "pm.expect(d.queued).to.be.a('number'); pm.expect(d).to.have.keys(['queued','waiting','active']);")] }),
  ] },

  { name: '07 Trade sync (fake bridge)', item: [
    req('Reset fake bridge', 'POST', `${FB}/__reset`, { body: {}, tests: [status(200)] }),
    signin('nina'),
    req('Connect MT5 (verified by the bridge)', 'POST', `${B}/accounts`, { as: 'nina', body: { mt5Login: 5550001, password: 'demo-pass', server: 'Fake-Server' },
      tests: [status(201), json, t('account created', "pm.expect(d.server).to.eql('Fake-Server'); pm.collectionVariables.set('ninaAccId', d.id);")] }),
    req('First trades load returns the full history', 'GET', `${B}/trades`, { as: 'nina', query: 'accountId={{ninaAccId}}',
      tests: [status(200), t('1500 trades rebuilt from 3001 deals', 'pm.expect(pm.response.json().data).to.have.length(1500);')] }),
    req('Bridge saw exactly one verify + one full-history deals call', 'GET', `${FB}/__stats`, {
      tests: [status(200), t('one backfill from 2020', "const s = pm.response.json(); pm.expect(s.verify).to.eql(1); pm.expect(s.deals).to.eql(1); pm.expect(s.last.from_time).to.eql('2020-01-01T00:00:00');")] }),
    req('Stats from the database (fast)', 'GET', `${B}/trades/stats`, { as: 'nina', query: 'accountId={{ninaAccId}}',
      tests: [status(200), t('1500 trades, $10k start', 'const d = pm.response.json().data; pm.expect(d.totalTrades).to.eql(1500); pm.expect(d.startingBalance).to.eql(10000);'),
        t('answered from Postgres in < 400ms', 'pm.expect(pm.response.responseTime).to.be.below(400);')] }),
    req('Trades again (memoised)', 'GET', `${B}/trades`, { as: 'nina', query: 'accountId={{ninaAccId}}', tests: [status(200), t('< 400ms', 'pm.expect(pm.response.responseTime).to.be.below(400);')] }),
    req('Deals from the database', 'GET', `${B}/trades/deals`, { as: 'nina', query: 'accountId={{ninaAccId}}', tests: [status(200), t('3001 deals', 'pm.expect(pm.response.json().data).to.have.length(3001);')] }),
    req('Page reads never touched the bridge again', 'GET', `${FB}/__stats`, { tests: [status(200), t('still one deals call', 'pm.expect(pm.response.json().deals).to.eql(1);')] }),
    req('New trade appears at the broker', 'POST', `${FB}/__add`, { body: {}, tests: [status(200)] }),
    req('Sync now pulls only recent deals', 'POST', `${B}/accounts/{{ninaAccId}}/sync`, { as: 'nina', body: {},
      tests: [status(200), json, t('synced, lastSyncAt set', "pm.expect(d.result).to.eql('synced'); pm.expect(d.account.lastSyncAt).to.be.a('string'); pm.expect(d.account.lastSyncError).to.eql(null);")] }),
    req('That sync was incremental (newest − 7 days)', 'GET', `${FB}/__stats`, { tests: [status(200), t('from ≈ newest − 7d', "const s = pm.response.json(); pm.expect(s.deals).to.eql(2); const from = Date.parse(s.last.from_time + 'Z') / 1000; const gap = (s.newest - 600 - 3600 - from); pm.expect(s.newest - from).to.be.above(7 * 86400 - 1); pm.expect(s.newest - from).to.be.below(7 * 86400 + 7200);")] }),
    req('The new trade is served', 'GET', `${B}/trades`, { as: 'nina', query: 'accountId={{ninaAccId}}', tests: [status(200), t('1501 trades', 'pm.expect(pm.response.json().data).to.have.length(1501);')] }),
    req('Wrong password on update is rejected by the bridge', 'PATCH', `${B}/accounts/{{ninaAccId}}/credentials`, { as: 'nina', body: { password: 'nope' }, tests: [status(409), code('BROKER_AUTH_FAILED')] }),
    req('Stored data still served after a failed update', 'GET', `${B}/trades/stats`, { as: 'nina', query: 'accountId={{ninaAccId}}', tests: [status(200), t('1501', 'pm.expect(pm.response.json().data.totalTrades).to.eql(1501);')] }),
    // ── Phase 3: one-call dashboard, compression, caching headers, rate limit
    req('Dashboard in one request', 'GET', `${B}/trades/dashboard`, { as: 'nina', query: 'accountId={{ninaAccId}}', headers: [{ key: 'Accept-Encoding', value: 'gzip' }],
      tests: [status(200), json,
        t('stats + trades + journal + sync info', "pm.expect(d.stats.totalTrades).to.eql(1501); pm.expect(d.trades).to.have.length(1501); pm.expect(d.journal).to.be.an('array'); pm.expect(d.syncedAt).to.be.a('string'); pm.expect(d.lastSyncError).to.eql(null);"),
        t('gzipped', "pm.expect(pm.response.headers.get('Content-Encoding')).to.eql('gzip');"),
        t('private, revalidated by browsers', "pm.expect(pm.response.headers.get('Cache-Control')).to.eql('private, no-cache'); pm.expect(pm.response.headers.get('ETag')).to.match(/^W\\//); pm.collectionVariables.set('dashEtag', pm.response.headers.get('ETag'));"),
        t('fast', 'pm.expect(pm.response.responseTime).to.be.below(400);')] }),
    req('Unchanged dashboard revalidates as 304 (no body)', 'GET', `${B}/trades/dashboard`, { as: 'nina', query: 'accountId={{ninaAccId}}', // Postman sends Cache-Control: no-cache by default, which (correctly) disables 304s;
      // send what a browser sends when revalidating.
      headers: [{ key: 'If-None-Match', value: '{{dashEtag}}' }, { key: 'Cache-Control', value: 'max-age=0' }],
      tests: [status(304), t('empty body', 'pm.expect(pm.response.text()).to.eql("");')] }),
    req('Sync now ×5 within the limit', 'POST', `${B}/accounts/{{ninaAccId}}/sync`, { as: 'nina', body: {},
      pre: ["const done = []; const fire = i => pm.sendRequest({ url: pm.collectionVariables.get('baseUrl') + '/api/accounts/' + pm.collectionVariables.get('ninaAccId') + '/sync', method: 'POST', header: { Cookie: pm.collectionVariables.get('ninaCookie'), 'Content-Type': 'application/json' }, body: { mode: 'raw', raw: '{}' } }, (e, r) => { done.push(r.code); if (i < 4) fire(i + 1); else pm.collectionVariables.set('syncCodes', JSON.stringify(done)); }); fire(0);"],
      tests: ["pm.test('the 7th sync in a minute is rate limited', () => { pm.expect(pm.response.code).to.eql(429); pm.expect(pm.response.json().error.code).to.eql('RATE_LIMITED'); pm.expect(pm.response.headers.get('Retry-After')).to.eql('60'); });",
        "pm.test('the earlier ones went through', () => pm.expect(JSON.parse(pm.collectionVariables.get('syncCodes'))).to.eql([200,200,200,200,200]));"] }),
  ] },
];

const users = { admin: 'Ada Admin', rohan: 'Rohan Mehta', sana: 'Sana Qureshi', nina: 'Nina Bose', c1: 'Aarav Sharma', c2: 'Priya Iyer', c3: 'Kabir Singh', c4: 'Meera Nair', c5: 'Dev Patel', c6: 'Zoya Khan', c7: 'Ishaan Rao' };
const variable = [
  { key: 'baseUrl', value: 'http://localhost:4100' },
  { key: 'altUrl', value: 'http://127.0.0.1:4100' },
  { key: 'appUrl', value: 'http://localhost:3000' },
  { key: 'password', value: 'Partner-test-Passw0rd!' },
  { key: 'internalToken', value: 'partner-test-internal-token' },
  ...Object.entries(users).flatMap(([k, n]) => [
    { key: `${k}Email`, value: k === 'admin' ? 'admin@partners.test' : `${k}@partners.test` },
    { key: `${k}Name`, value: n },
    { key: `${k}First`, value: n.split(' ')[0] },
  ]),
];

const collection = {
  info: {
    name: 'TRADElogs — Partner programme',
    description: 'Contract tests for apps/api/openapi/partners.openapi.yaml. Run with apps/api/postman/run.sh against a disposable database.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: folders,
  variable,
};
writeFileSync(path.join(dir, 'partners.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
console.log(`wrote ${folders.reduce((n, f) => n + f.item.length, 0)} requests in ${folders.length} folders`);
