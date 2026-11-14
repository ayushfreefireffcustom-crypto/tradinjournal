// HTTP handlers for the Elefin partner connection (partner portal + admin).
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ok } from '../../../../http/response.js';
import { requireActivePartner, getPartnerById } from '../../partners.service.js';
import { partnerUserId } from '../../view-as.js';
import * as elefin from './service.js';

type Handler = (req: Request, res: Response) => Promise<void>;
const h = (fn: Handler): RequestHandler => (req, res, next: NextFunction) => { fn(req, res).catch(next); };
const actor = (res: Response) => { const u = res.locals.user as { id: string; email: string }; return { id: u.id, email: u.email }; };
const partner = (res: Response) => requireActivePartner(partnerUserId(res));

// Partner
export const handleStatus = h(async (_req, res) => ok(res, await elefin.connectionStatus((await partner(res)).id)));
export const handleTest = h(async (req, res) => ok(res, await elefin.testConnection((await partner(res)).id, req.body ?? {})));
export const handleConnect = h(async (req, res) => ok(res, await elefin.connect((await partner(res)).id, req.body, actor(res))));
export const handleSyncNow = h(async (_req, res) => ok(res, await elefin.syncNow((await partner(res)).id, actor(res))));
export const handleDisconnect = h(async (_req, res) => ok(res, await elefin.disconnect((await partner(res)).id, actor(res))));

// Admin
export const handleAdminList = h(async (_req, res) => ok(res, await elefin.adminConnections()));
export const handleAdminStatus = h(async (req, res) => ok(res, await elefin.connectionStatus((await getPartnerById(String(req.params.id))).id)));
export const handleAdminSync = h(async (req, res) => ok(res, await elefin.adminSync((await getPartnerById(String(req.params.id))).id, actor(res))));
