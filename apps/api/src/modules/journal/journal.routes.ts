import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { handleList, handleCreate, handleUpdate, handleDelete } from './journal.controller.js';

const entryFields = {
  title: z.string().max(200).optional(),
  body: z.string().max(50_000),
  emotion: z.string().max(40).optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  tradeId: z.string().max(64).optional(),
  entryDate: z.string().max(40).refine(s => !Number.isNaN(Date.parse(s)), 'Invalid date').optional(),
};
const createEntrySchema = z.object({ ...entryFields, brokerAccountId: z.string().max(64).optional() });
// The journal page re-sends brokerAccountId on edit; it's accepted and ignored.
const updateEntrySchema = z.object(entryFields).partial().extend({ brokerAccountId: z.string().max(64).optional() });

export const journalRouter: IRouter = Router();

journalRouter.use(requireAuth, requirePlatformAccess);

journalRouter.get('/', handleList);
journalRouter.post('/', validateBody(createEntrySchema), handleCreate);
journalRouter.patch('/:id', validateBody(updateEntrySchema), handleUpdate);
journalRouter.delete('/:id', handleDelete);
