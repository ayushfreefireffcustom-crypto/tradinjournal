import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { PartnerRange } from '@tradinjournal/contracts';
import { ok, created, noContent } from '../../../http/response.js';
import { requireActivePartner } from '../partners.service.js';
import { catalog } from './brokers.js';
import { listBrokers, recheckPartner, removeBroker, reviewVerification, syncBroker, uploadList, upsertBroker, verifyOne } from './ib.service.js';
import { clearPerkCache, clientAccess, joinPartner, recomputePartner, recomputeUser, setConsent } from './access.service.js';
import { createPackage, packagesPage, setTemplateAudience, updatePackage } from './packages.service.js';
import { exportCsv, listEvents, programOverview, reviewQueue } from './reports.service.js';
import { getProgramSettings, saveProgramSettings } from './settings.js';
import { runIbCycle } from './cycle.js';

type Handler = (req: Request, res: Response) => Promise<void>;
const h = (fn: Handler): RequestHandler => (req, res, next: NextFunction) => { fn(req, res).catch(next); };
const userOf = (res: Response) => res.locals.user as { id: string; email: string; name: string };
const actor = (res: Response) => ({ id: userOf(res).id, email: userOf(res).email });
const param = (req: Request, k: string) => String(req.params[k] ?? '');
const partner = (res: Response) => requireActivePartner(userOf(res).id);

// ── Partner: brokers ──────────────────────────────────────────────────────────

export const handleBrokers = h(async (_req, res) => {
  const p = await partner(res);
  ok(res, { brokers: await listBrokers(p.id), catalog: catalog() });
});
export const handleUpsertBroker = h(async (req, res) => {
  const p = await partner(res);
  const b = await upsertBroker(p, req.body, actor(res));
  await recomputePartner(p.id);
  created(res, b);
});
export const handleRemoveBroker = h(async (req, res) => {
  const p = await partner(res);
  await removeBroker(p.id, param(req, 'id'), actor(res));
  await recomputePartner(p.id);
  noContent(res);
});
export const handleUploadList = h(async (req, res) => {
  const p = await partner(res);
  const out = await uploadList(p.id, param(req, 'id'), req.body, actor(res));
  await recomputePartner(p.id);
  ok(res, out);
});
export const handleSyncBroker = h(async (req, res) => {
  const p = await partner(res);
  const owned = (await listBrokers(p.id)).find(b => b.id === param(req, 'id'));
  if (!owned) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Broker connection not found' } }); return; }
  const b = await syncBroker(owned.id, actor(res));
  await recomputePartner(p.id);
  ok(res, b);
});

// ── Partner: packages ─────────────────────────────────────────────────────────

export const handlePackages = h(async (_req, res) => ok(res, await packagesPage(await partner(res))));
export const handleCreatePackage = h(async (req, res) => created(res, await createPackage(await partner(res), req.body, actor(res))));
export const handleUpdatePackage = h(async (req, res) => ok(res, await updatePackage(await partner(res), param(req, 'id'), req.body, actor(res))));
export const handleTemplateAudience = h(async (req, res) => {
  const p = await partner(res);
  const out = await setTemplateAudience(p, param(req, 'id'), !!req.body?.partnerOnly, actor(res));
  ok(res, out);
});

// ── Client: access page ───────────────────────────────────────────────────────

export const handleAccess = h(async (_req, res) => ok(res, await clientAccess(userOf(res).id, userOf(res).email)));
export const handleJoin = h(async (req, res) => ok(res, await joinPartner(userOf(res), req.body.code)));
export const handleVerify = h(async (req, res) => {
  const u = userOf(res);
  await verifyOne(u.id, req.body.brokerAccountId, { brokerEmail: req.body.brokerEmail, userEmail: u.email });
  await recomputeUser(u.id);
  ok(res, await clientAccess(u.id, u.email));
});
export const handleRequestReview = h(async (req, res) => {
  const u = userOf(res);
  await verifyOne(u.id, req.body.brokerAccountId, { requestReview: true, userEmail: u.email });
  ok(res, await clientAccess(u.id, u.email));
});
export const handleConsent = h(async (req, res) => ok(res, await setConsent(userOf(res), req.body.share)));

// ── Admin: programme ──────────────────────────────────────────────────────────

export const handleProgram = h(async (req, res) => ok(res, await programOverview(req.query.range as PartnerRange)));
export const handleReviews = h(async (_req, res) => ok(res, await reviewQueue()));
export const handleReviewDecision = h(async (req, res) => {
  const out = await reviewVerification(param(req, 'id'), req.body.action, req.body.note, actor(res));
  await recomputeUser(out.userId);
  ok(res, out);
});
export const handleEvents = h(async (req, res) => ok(res, await listEvents(req.query as unknown as { partnerId?: string; kind?: string; limit: number })));
export const handleGetSettings = h(async (_req, res) => ok(res, await getProgramSettings()));
export const handleSaveSettings = h(async (req, res) => {
  const s = await saveProgramSettings(req.body, userOf(res).email);
  clearPerkCache();
  ok(res, s);
});
export const handleExport = h(async (req, res) => {
  const type = req.query.type === 'partners' ? 'partners' : 'clients';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tradelogs-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(await exportCsv(type));
});
export const handleAdminRecheck = h(async (req, res) => {
  const n = await recheckPartner(param(req, 'id'));
  await recomputePartner(param(req, 'id'));
  ok(res, { rechecked: n });
});

// ── Internal ──────────────────────────────────────────────────────────────────

export const handleIbCycle = h(async (_req, res) => ok(res, (await runIbCycle()) ?? { skipped: true }));
