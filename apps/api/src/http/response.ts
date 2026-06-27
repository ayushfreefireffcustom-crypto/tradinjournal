import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, meta?: PaginationMeta): void {
  res.json(meta ? { data, meta } : { data });
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ data });
}

export function noContent(res: Response): void {
  res.status(204).end();
}
