import type { Request, Response, NextFunction } from 'express';
import type { LiquidationMapQuery } from '@tradinjournal/contracts';
import { ok } from '../../http/response.js';
import { liquidationMap, maxPainBoard } from './liquidations.service.js';

// GET /api/liquidations/map?coin=BTC&window=48h — estimated liquidation ladder.
export async function handleLiquidationMap(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await liquidationMap(req.query as unknown as LiquidationMapQuery));
  } catch (err) {
    next(err);
  }
}

// GET /api/liquidations/max-pain — max pain for every supported coin.
export async function handleMaxPainBoard(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await maxPainBoard());
  } catch (err) {
    next(err);
  }
}
