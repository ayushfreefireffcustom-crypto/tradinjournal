// Partner tools: indicators, chart templates, journal templates, algorithms / EAs and
// guides a partner offers their clients. An admin approves each version before any
// client sees it; clients reach approved tools through a package they hold.
import { prisma } from '@tradinjournal/db';
import type { ClientProductDetailDto, ClientProductDto, PartnerProductDto, ProductType } from '@tradinjournal/contracts';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../http/errors.js';
import { logEvent } from './events.js';
import { termsOf } from './terms.js';

const MAX_PRODUCTS = 50;
const MAX_FILE = 2 * 1024 * 1024;
const LIVE = ['ACTIVE', 'GRACE'] as const;
type Actor = { id: string; email: string } | null;
type Row = Awaited<ReturnType<typeof prisma.partnerProduct.findFirstOrThrow>>;

async function usage(ids: string[]) {
  if (!ids.length) return new Map<string, { opens: number; users: number }>();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.usageEvent.groupBy({
    by: ['feature', 'userId'], where: { type: 'partner_product', feature: { in: ids.map(i => `product:${i}`) }, createdAt: { gte: since } }, _count: { _all: true },
  });
  const out = new Map<string, { opens: number; users: number }>();
  for (const r of rows) {
    const id = r.feature!.slice(8), cur = out.get(id) ?? { opens: 0, users: 0 };
    out.set(id, { opens: cur.opens + r._count._all, users: cur.users + 1 });
  }
  return out;
}

function toDto(p: Row, packages: string[], u?: { opens: number; users: number }): PartnerProductDto {
  return {
    id: p.id, type: p.type as ProductType, name: p.name, description: p.description, platform: p.platform, content: p.content, url: p.url,
    fileName: p.fileName, fileSize: p.fileSize, version: p.version, status: p.status, reviewNote: p.reviewNote, updatedAt: p.updatedAt.toISOString(),
    packages, opens30d: u?.opens ?? 0, users30d: u?.users ?? 0,
  };
}

const NO_FILE = { fileData: false } as const;
const SELECT = {
  id: true, partnerId: true, type: true, name: true, description: true, platform: true, content: true, url: true, fileName: true, fileType: true,
  fileSize: true, version: true, status: true, reviewNote: true, reviewedBy: true, reviewedAt: true, createdAt: true, updatedAt: true,
} as const;

export async function listProducts(partnerId: string): Promise<PartnerProductDto[]> {
  const [rows, pkgs] = await Promise.all([
    prisma.partnerProduct.findMany({ where: { partnerId, status: { not: 'ARCHIVED' } }, select: SELECT, orderBy: { updatedAt: 'desc' } }),
    prisma.partnerPackage.findMany({ where: { partnerId, status: { not: 'ARCHIVED' } }, select: { name: true, productIds: true } }),
  ]);
  const u = await usage(rows.map(r => r.id));
  return rows.map(r => toDto({ ...r, fileData: null } as Row, pkgs.filter(p => p.productIds.includes(r.id)).map(p => p.name), u.get(r.id)));
}

async function own(partnerId: string, id: string) {
  const p = await prisma.partnerProduct.findFirst({ where: { id, partnerId }, select: SELECT });
  if (!p) throw new NotFoundError('Tool not found');
  return p;
}

async function assertCanOffer(partnerId: string) {
  const { permissions } = await termsOf(partnerId);
  if (!permissions.canOfferProducts) throw new AppError(403, 'PRODUCTS_NOT_ALLOWED', 'Offering your own tools isn’t enabled for your account. Ask TRADElogs to switch it on.');
}

function hasBody(x: { content?: string | null; url?: string | null; fileName?: string | null }) {
  return !!(x.content?.trim() || x.url?.trim() || x.fileName);
}

export async function createProduct(partnerId: string, input: { type: ProductType; name: string; description?: string; platform?: string; content?: string; url?: string }, actor: Actor = null) {
  await assertCanOffer(partnerId);
  if (await prisma.partnerProduct.count({ where: { partnerId, status: { not: 'ARCHIVED' } } }) >= MAX_PRODUCTS) throw new ConflictError(`You can have up to ${MAX_PRODUCTS} tools.`);
  const p = await prisma.partnerProduct.create({
    data: { partnerId, type: input.type, name: input.name, description: input.description || null, platform: input.platform ?? null, content: input.content || null, url: input.url || null },
    select: SELECT,
  });
  await logEvent({ kind: 'product.create', partnerId, actor, message: `Tool “${p.name}” created` });
  return toDto({ ...p, fileData: null } as Row, []);
}

/** Editing an approved tool sends the new version back for review. */
export async function updateProduct(partnerId: string, id: string, input: Partial<{ type: ProductType; name: string; description: string; platform: string; content: string; url: string; archived: boolean }>, actor: Actor = null) {
  const prev = await own(partnerId, id);
  if (input.archived) {
    await prisma.partnerProduct.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await logEvent({ kind: 'product.archive', partnerId, actor, message: `Tool “${prev.name}” archived` });
    return (await listProducts(partnerId)).find(x => x.id === id) ?? null;
  }
  await assertCanOffer(partnerId);
  const changed = ['content', 'url', 'type', 'platform'].some(k => k in input && (input as Record<string, unknown>)[k] !== (prev as Record<string, unknown>)[k]);
  const p = await prisma.partnerProduct.update({
    where: { id },
    data: {
      ...(input.type ? { type: input.type } : {}), ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.platform !== undefined ? { platform: input.platform || null } : {}),
      ...(input.content !== undefined ? { content: input.content || null } : {}),
      ...(input.url !== undefined ? { url: input.url || null } : {}),
      ...(changed && prev.status === 'APPROVED' ? { status: 'PENDING', version: { increment: 1 }, reviewNote: null } : {}),
      ...(prev.status === 'ARCHIVED' ? { status: 'DRAFT' } : {}),
    },
    select: SELECT,
  });
  if (changed && prev.status === 'APPROVED') await logEvent({ kind: 'product.resubmit', partnerId, actor, message: `Tool “${p.name}” changed: version ${p.version} sent for review` });
  return (await listProducts(partnerId)).find(x => x.id === id)!;
}

export async function setProductFile(partnerId: string, id: string, input: { fileName: string; fileType?: string; data: string }, actor: Actor = null) {
  const prev = await own(partnerId, id);
  await assertCanOffer(partnerId);
  const buf = Buffer.from(input.data, 'base64');
  if (!buf.length) throw new ValidationError('The file is empty.');
  if (buf.length > MAX_FILE) throw new ValidationError('Files can be up to 2 MB.');
  await prisma.partnerProduct.update({
    where: { id },
    data: {
      fileName: input.fileName, fileType: input.fileType || 'application/octet-stream', fileSize: buf.length, fileData: buf,
      ...(prev.status === 'APPROVED' ? { status: 'PENDING', version: { increment: 1 }, reviewNote: null } : {}),
    },
  });
  await logEvent({ kind: 'product.file', partnerId, actor, message: `File “${input.fileName}” (${Math.ceil(buf.length / 1024)} KB) attached to “${prev.name}”` });
  return (await listProducts(partnerId)).find(x => x.id === id)!;
}

export async function submitProduct(partnerId: string, id: string, actor: Actor = null) {
  const p = await own(partnerId, id);
  if (!hasBody(p)) throw new ValidationError('Add the code, a link or a file before sending it for review.');
  if (p.status === 'APPROVED' || p.status === 'PENDING') throw new ConflictError(p.status === 'PENDING' ? 'It’s already waiting for review.' : 'It’s already approved.');
  await prisma.partnerProduct.update({ where: { id }, data: { status: 'PENDING', reviewNote: null } });
  await logEvent({ kind: 'product.submit', partnerId, actor, message: `Tool “${p.name}” sent for review` });
  return (await listProducts(partnerId)).find(x => x.id === id)!;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function productQueue() {
  const rows = await prisma.partnerProduct.findMany({
    where: { status: 'PENDING' }, select: { ...SELECT, partner: { select: { id: true, user: { select: { name: true } } } } }, orderBy: { updatedAt: 'asc' }, take: 200,
  });
  return rows.map(r => ({ ...toDto({ ...r, fileData: null } as unknown as Row, []), partner: { id: r.partner.id, name: r.partner.user.name } }));
}

export async function reviewProduct(id: string, action: 'approve' | 'reject', note: string | undefined, actor: { id: string; email: string }) {
  const p = await prisma.partnerProduct.findUnique({ where: { id }, select: SELECT });
  if (!p) throw new NotFoundError('Tool not found');
  if (p.status !== 'PENDING') throw new ConflictError('Only tools waiting for review can be decided.');
  if (action === 'reject' && !note) throw new ValidationError('Say why, so the partner can fix it.');
  await prisma.partnerProduct.update({
    where: { id }, data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', reviewNote: note ?? null, reviewedBy: actor.email, reviewedAt: new Date() },
  });
  await logEvent({ kind: `product.${action}`, partnerId: p.partnerId, actor, message: `Tool “${p.name}” v${p.version} ${action === 'approve' ? 'approved' : 'rejected'}${note ? `: ${note}` : ''}` });
  return { id, status: action === 'approve' ? 'APPROVED' : 'REJECTED' };
}

/** The raw file for an admin reviewing it. */
export async function productFileForAdmin(id: string) {
  const p = await prisma.partnerProduct.findUnique({ where: { id }, select: { fileName: true, fileType: true, fileData: true } });
  if (!p?.fileData) throw new NotFoundError('No file');
  return { name: p.fileName ?? 'file', type: p.fileType ?? 'application/octet-stream', data: Buffer.from(p.fileData) };
}

// ── Clients ───────────────────────────────────────────────────────────────────

/** Approved tools in the packages this user holds right now. */
export async function clientProducts(userId: string): Promise<ClientProductDto[]> {
  const held = await prisma.clientEntitlement.findMany({ where: { userId, status: { in: [...LIVE] } }, include: { package: { select: { productIds: true } } } });
  const ids = [...new Set(held.flatMap(h => h.package.productIds))];
  if (!ids.length) return [];
  const rows = await prisma.partnerProduct.findMany({
    where: { id: { in: ids }, status: 'APPROVED' },
    select: { ...SELECT, partner: { select: { user: { select: { name: true } } } } }, orderBy: { name: 'asc' },
  });
  return rows.map(r => ({
    id: r.id, type: r.type as ProductType, name: r.name, description: r.description, platform: r.platform, hasContent: !!r.content,
    url: r.url, fileName: r.fileName, fileSize: r.fileSize, version: r.version, partner: r.partner.user.name,
  }));
}

async function track(userId: string, id: string, what: 'open' | 'download') {
  await prisma.usageEvent.create({ data: { userId, type: 'partner_product', feature: `product:${id}`, path: `/access/tools/${id}`, meta: { what } } }).catch(() => {});
}

export async function clientProduct(userId: string, id: string): Promise<ClientProductDetailDto> {
  const list = await clientProducts(userId);
  const p = list.find(x => x.id === id);
  if (!p) throw new NotFoundError('That tool isn’t in a package you hold.');
  const row = await prisma.partnerProduct.findUnique({ where: { id }, select: { content: true } });
  await track(userId, id, 'open');
  return { ...p, content: row?.content ?? null };
}

export async function clientProductFile(userId: string, id: string) {
  if (!(await clientProducts(userId)).some(x => x.id === id)) throw new NotFoundError('That tool isn’t in a package you hold.');
  const p = await prisma.partnerProduct.findUnique({ where: { id }, select: { fileName: true, fileType: true, fileData: true } });
  if (!p?.fileData) throw new NotFoundError('No file');
  await track(userId, id, 'download');
  return { name: p.fileName ?? 'file', type: p.fileType ?? 'application/octet-stream', data: Buffer.from(p.fileData) };
}

export { NO_FILE };
