import { ok } from '@/lib/mock-data';
import { calWatch } from '@/lib/mock-news';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) { calWatch().add((await params).id); return ok({ watched: true }); }
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) { calWatch().delete((await params).id); return ok({ watched: false }); }
