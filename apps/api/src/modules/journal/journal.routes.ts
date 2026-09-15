import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { handleList, handleCreate, handleUpdate, handleDelete } from './journal.controller.js';

export const journalRouter: IRouter = Router();

journalRouter.use(requireAuth, requirePlatformAccess);

journalRouter.get('/', handleList);
journalRouter.post('/', handleCreate);
journalRouter.patch('/:id', handleUpdate);
journalRouter.delete('/:id', handleDelete);
