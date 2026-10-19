import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { PartnerClientsQuery, PartnerRange, PartnerStatusDto } from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';
import { ok, created, noContent } from '../../http/response.js';
import { clientIp, countryFromHeaders, deviceFromUa, readCookie, REF_COOKIE } from './partner.logic.js';
import { checkCode, recordClick } from './attribution.service.js';
import {
  applyAsPartner, archiveChannel, createChannel, findPartnerByUser, links, listClients, overview, releaseCode,
  requireActivePartner, reserveCode, toProfile,
} from './partners.service.js';
import * as admin from './partners.admin.service.js';
import { refreshReferralStats } from './stats.service.js';

type Handler = (req: Request, res: Response) => Promise<void>;
/** Express 4 doesn't catch async rejections — route every error to the handler. */
const h = (fn: Handler): RequestHandler => (req, res, next: NextFunction) => { fn(req, res).catch(next); };
const userOf = (res: Response) => res.locals.user as { id: string; email: string; name: string };
const actor = (res: Response) => ({ id: userOf(res).id, email: userOf(res).email });
const param = (req: Request, k: string) => String(req.params[k] ?? '');

// ── Public ────────────────────────────────────────────────────────────────────

export const handleReferralLink = h(async (req, res) => {
  const out = await recordClick({
    code: param(req, 'code'),
    channelSlug: typeof req.query.ch === 'string' ? req.query.ch.slice(0, 40) : null,
    ip: clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress),
    device: deviceFromUa(req.headers['user-agent']),
    country: countryFromHeaders(k => { const v = req.headers[k]; return Array.isArray(v) ? v[0] : v; }),
    referrer: typeof req.headers.referer === 'string' ? req.headers.referer : null,
    existingCookie: readCookie(req.headers.cookie, REF_COOKIE),
  });
  if (out.cookie) {
    res.cookie(REF_COOKIE, out.cookie, {
      httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/',
      maxAge: env.PARTNER_COOKIE_DAYS * 86_400_000,
    });
  }
  res.set('Cache-Control', 'no-store');
  res.redirect(302, out.redirect);
});

export const handleCheckCode = h(async (req, res) => ok(res, await checkCode(String(req.query.code))));

// ── Partner portal ────────────────────────────────────────────────────────────

export const handleMe = h(async (_req, res) => {
  const p = await findPartnerByUser(userOf(res).id);
  ok(res, p ? toProfile(p) : null);
});

export const handleApply = h(async (req, res) => created(res, await applyAsPartner(userOf(res).id, userOf(res).name, req.body)));

export const handleOverview = h(async (req, res) => {
  const p = await requireActivePartner(userOf(res).id);
  ok(res, await overview(p, req.query.range as PartnerRange));
});

export const handleClients = h(async (req, res) => {
  const p = await requireActivePartner(userOf(res).id);
  const { items, counts, meta } = await listClients(p.id, req.query as unknown as PartnerClientsQuery);
  ok(res, { items, counts }, meta);
});

export const handleLinks = h(async (_req, res) => ok(res, await links(await requireActivePartner(userOf(res).id))));

export const handleCreateChannel = h(async (req, res) => {
  const p = await requireActivePartner(userOf(res).id);
  created(res, await createChannel(p, req.body.label));
});

export const handleArchiveChannel = h(async (req, res) => {
  const p = await requireActivePartner(userOf(res).id);
  await archiveChannel(p.id, param(req, 'channelId'));
  noContent(res);
});

export const handleReserveCode = h(async (req, res) => {
  const p = await requireActivePartner(userOf(res).id);
  created(res, await reserveCode(p, req.body.code));
});

export const handleReleaseCode = h(async (req, res) => {
  const p = await requireActivePartner(userOf(res).id);
  await releaseCode(p.id, param(req, 'codeId'));
  noContent(res);
});

// ── Admin ─────────────────────────────────────────────────────────────────────

export const handleAdminList = h(async (req, res) => ok(res, await admin.listPartners(req.query.status as PartnerStatusDto | undefined)));
export const handleAdminCreate = h(async (req, res) => created(res, await admin.createPartner(req.body, actor(res))));
export const handleAdminLookup = h(async (req, res) => ok(res, await admin.lookup(String(req.query.q))));
export const handleAdminDetail = h(async (req, res) => ok(res, await admin.partnerDetail(param(req, 'id'), req.query.range as PartnerRange)));

export const handleAdminClients = h(async (req, res) => {
  const { items, counts, meta } = await listClients((await admin.partnerDetailExists(param(req, 'id'))), req.query as unknown as PartnerClientsQuery);
  ok(res, { items, counts }, meta);
});

export const handleAdminAssign = h(async (req, res) => created(res, await admin.assignClient(param(req, 'id'), req.body, actor(res))));
export const handleAdminUnlink = h(async (req, res) => {
  await admin.unlinkClient(param(req, 'id'), param(req, 'clientId'), typeof req.query.reason === 'string' ? req.query.reason.slice(0, 300) : undefined, actor(res));
  noContent(res);
});
export const handleAdminMove = h(async (req, res) => ok(res, await admin.moveAllClients(param(req, 'id'), req.body.toPartnerId, req.body.reason, actor(res))));
export const handleAdminStatus = h(async (req, res) => ok(res, await admin.setStatus(param(req, 'id'), req.body, actor(res))));
export const handleAdminNote = h(async (req, res) => created(res, await admin.addNote(param(req, 'id'), req.body.body, actor(res))));
export const handleAdminRevokeCode = h(async (req, res) => {
  await admin.revokeCode(param(req, 'id'), param(req, 'codeId'), actor(res));
  noContent(res);
});
export const handleReservedList = h(async (_req, res) => ok(res, await admin.listReserved()));
export const handleReservedCreate = h(async (req, res) => created(res, await admin.reserveName(req.body.code, req.body.reason, actor(res))));
export const handleReservedDelete = h(async (req, res) => {
  await admin.releaseName(param(req, 'reservedId'), actor(res));
  noContent(res);
});

// ── Internal ──────────────────────────────────────────────────────────────────

export const handleRefreshStats = h(async (req, res) => ok(res, await refreshReferralStats({ limit: req.body?.limit })));
