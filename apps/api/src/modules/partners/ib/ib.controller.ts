import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { PartnerRange } from '@tradinjournal/contracts';
import { ok, created, noContent } from '../../../http/response.js';
import { requireActivePartner } from '../partners.service.js';
import { catalog } from './brokers.js';
import { listBrokers, recheckPartner, removeBroker, reviewVerification, syncBroker, uploadList, upsertBroker, verifyOne } from './ib.service.js';
import { clearPerkCache, clientAccess, perksFor, joinPartner, recomputePartner, recomputeUser, setConsent } from './access.service.js';
import { createPackage, packagesPage, setTemplateAudience, updatePackage } from './packages.service.js';
import { exportCsv, listEvents, programOverview, reviewQueue } from './reports.service.js';
import { getProgramSettings, saveProgramSettings } from './settings.js';
import { runIbCycle } from './cycle.js';
import * as integ from './integrations.service.js';
import * as products from './products.service.js';
import { partnerEarnings, partnerReports, cohorts } from './analytics.service.js';
import { adminPackages, setAdminHold } from './packages.service.js';
import { setTerms, termsOf } from './terms.js';
import { addExternalAccount, removeExternalAccount } from './ib.service.js';
import { getPartnerById } from '../partners.service.js';
import { prisma } from '@tradinjournal/db';
import { partnerClientsCsv } from './reports.service.js';

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
/** Cheap check for the web shell: which features are locked and which this user may open. */
export const handlePerks = h(async (_req, res) => ok(res, await perksFor(userOf(res).id, userOf(res).email)));
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

// ── Phase 2: integrations, tools, reports ──────────────────────────────

const sendFile = (res: Response, f: { name: string; type: string; data: Buffer }) => {
  res.setHeader('Content-Type', f.type);
  res.setHeader('Content-Disposition', `attachment; filename="${f.name.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(f.data);
};

// Partner: integrations
export const handleIntegration = h(async (req, res) => ok(res, await integ.integration((await partner(res)).id, param(req, 'id'))));
export const handleRotatePostback = h(async (req, res) => ok(res, await integ.rotatePostback((await partner(res)).id, param(req, 'id'), actor(res))));
export const handleApiConfig = h(async (req, res) => {
  const p = await partner(res);
  const out = await integ.saveApiConfig(p.id, param(req, 'id'), req.body.config, req.body.secret, actor(res));
  await recheckPartner(p.id);
  await recomputePartner(p.id);
  ok(res, out);
});
export const handleEarningsUpload = h(async (req, res) => ok(res, await integ.uploadEarnings((await partner(res)).id, param(req, 'id'), req.body.text, req.body.currency, actor(res))));

// Public: broker postback (GET query or POST form / JSON). Always 200 so brokers don't retry forever.
export const handlePostback = h(async (req, res) => {
  const params = { ...(req.query as Record<string, unknown>), ...(req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}) };
  const out = await integ.receivePostback(param(req, 'token'), params);
  if (out.partnerId && out.touchedUsers.length) for (const u of out.touchedUsers) await recomputeUser(u);
  res.status(out.status === 'error' && !out.partnerId ? 404 : 200).json({ status: out.status });
});

// Partner: tools
export const handleProducts = h(async (_req, res) => ok(res, await products.listProducts((await partner(res)).id)));
export const handleCreateProduct = h(async (req, res) => created(res, await products.createProduct((await partner(res)).id, req.body, actor(res))));
export const handleUpdateProduct = h(async (req, res) => {
  const p = await partner(res);
  const out = await products.updateProduct(p.id, param(req, 'id'), req.body, actor(res));
  await recomputePartner(p.id);
  ok(res, out);
});
export const handleProductFile = h(async (req, res) => ok(res, await products.setProductFile((await partner(res)).id, param(req, 'id'), req.body, actor(res))));
export const handleSubmitProduct = h(async (req, res) => ok(res, await products.submitProduct((await partner(res)).id, param(req, 'id'), actor(res))));

// Partner: IB earnings (as brokers report them) and reports
export const handleEarnings = h(async (_req, res) => ok(res, await partnerEarnings((await partner(res)).id)));
export const handleReports = h(async (req, res) => ok(res, await partnerReports(await partner(res), req.query.range as PartnerRange)));
export const handlePartnerExport = h(async (_req, res) => {
  const p = await partner(res);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="my-clients-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(await partnerClientsCsv(p.id));
});

// Client: tools and accounts
export const handleClientProduct = h(async (req, res) => ok(res, await products.clientProduct(userOf(res).id, param(req, 'id'))));
export const handleClientProductFile = h(async (req, res) => sendFile(res, await products.clientProductFile(userOf(res).id, param(req, 'id'))));
export const handleAddAccount = h(async (req, res) => {
  const u = userOf(res);
  await addExternalAccount(u, req.body);
  await recomputeUser(u.id);
  created(res, await clientAccess(u.id, u.email));
});
export const handleRemoveAccount = h(async (req, res) => {
  const u = userOf(res);
  await removeExternalAccount(u.id, param(req, 'id'));
  await recomputeUser(u.id);
  ok(res, await clientAccess(u.id, u.email));
});
// Admin
export const handleProductQueue = h(async (_req, res) => ok(res, await products.productQueue()));
export const handleProductReview = h(async (req, res) => {
  const out = await products.reviewProduct(param(req, 'id'), req.body.action, req.body.note, actor(res));
  const pr = await prisma.partnerProduct.findUnique({ where: { id: param(req, 'id') }, select: { partnerId: true } });
  if (pr) await recomputePartner(pr.partnerId);
  ok(res, out);
});
export const handleAdminProductFile = h(async (req, res) => sendFile(res, await products.productFileForAdmin(param(req, 'id'))));
export const handleAdminProduct = h(async (req, res) => {
  const p = await prisma.partnerProduct.findUnique({ where: { id: param(req, 'id') }, select: { id: true, name: true, type: true, platform: true, content: true, url: true, fileName: true, fileSize: true, description: true, version: true, status: true } });
  if (!p) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tool not found' } }); return; }
  ok(res, p);
});
export const handleAdminPackages = h(async (_req, res) => ok(res, await adminPackages()));
export const handleAdminPackageHold = h(async (req, res) => { await setAdminHold(param(req, 'id'), req.body.adminHold, req.body.note, actor(res)); ok(res, { ok: true }); });
export const handleAdminTerms = h(async (req, res) => ok(res, await setTerms((await getPartnerById(param(req, 'id'))).id, req.body, actor(res))));
export const handleAdminGetTerms = h(async (req, res) => ok(res, await termsOf((await getPartnerById(param(req, 'id'))).id)));
export const handleCohorts = h(async (req, res) => ok(res, await cohorts(typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined)));
