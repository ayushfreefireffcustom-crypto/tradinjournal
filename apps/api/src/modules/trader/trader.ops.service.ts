// Admin snapshot of the signal stack: which model is serving, vendor freshness,
// and how many paper fills are open. Does not mix paper results into the public
// track record.
import { prisma } from '@tradinjournal/db';
import { Prisma } from '@tradinjournal/db';
import { readVendorNotes } from '../../lib/market/flow/vendor-note.js';
import { CHAMPION_KEY, LGBM_MODEL_KEY } from './trader.lgbm.service.js';
import { META_MODEL_KEY } from './trader.meta.service.js';
import type { LgbmArtifact } from './trader.lgbm.client.js';
import type { MetaModelArtifact } from '@tradinjournal/core';

export interface TraderOpsStatus {
  champion: 'heuristic' | 'logistic' | 'lgbm';
  sampleSize: number;
  lastTrain: string | null;
  lgbm: {
    trained: boolean;
    serving: boolean;
    reason: string | null;
    auc: number | null;
  };
  vendors: Array<{ id: string; at: string | null; ok: boolean | null }>;
  openPaperPositions: number;
}

export async function getTraderOpsStatus(): Promise<TraderOpsStatus> {
  const [logistic, lgbmRow, champRow, vendors, openPaperPositions, sampleSize] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: META_MODEL_KEY } }),
    prisma.systemSetting.findUnique({ where: { key: LGBM_MODEL_KEY } }),
    prisma.systemSetting.findUnique({ where: { key: CHAMPION_KEY } }),
    readVendorNotes(['unusual_whales', 'deribit', 'benzinga', 'santiment']),
    prisma.traderPaperPosition.count({ where: { status: 'open' } }),
    prisma.traderAnalysis.count({
      where: {
        outcome: { in: ['TARGET_HIT', 'STOP_HIT'] },
        direction: { in: ['LONG', 'SHORT'] },
        NOT: { featureSnapshot: { equals: Prisma.DbNull } },
      },
    }),
  ]);

  const logisticModel = logistic?.value as MetaModelArtifact | null;
  const lgbm = lgbmRow?.value as LgbmArtifact | null;
  const champ = champRow?.value as { kind?: string } | null;
  const serving = champ?.kind === 'lgbm' && lgbm?.promoted === true;
  const champion: TraderOpsStatus['champion'] = serving ? 'lgbm' : logisticModel?.logistic ? 'logistic' : 'heuristic';

  return {
    champion,
    sampleSize,
    lastTrain: lgbm?.trainedAt ?? logisticModel?.trainedAt ?? null,
    lgbm: {
      trained: Boolean(lgbm?.trained && lgbm.model),
      serving,
      reason: lgbm?.promoteReason ?? null,
      auc: lgbm?.oofAuc ?? null,
    },
    vendors,
    openPaperPositions,
  };
}
