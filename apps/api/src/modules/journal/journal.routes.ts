import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { handleList, handleCreate, handleUpdate, handleDelete } from './journal.controller.js';

export const journalRouter: IRouter = Router();

journalRouter.use(requireAuth);

journalRouter.get('/', handleList);
journalRouter.post('/', handleCreate);
journalRouter.patch('/:id', handleUpdate);
journalRouter.delete('/:id', handleDelete);
