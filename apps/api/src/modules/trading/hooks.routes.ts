// Public TradingView webhook endpoint (D14): POST /api/hooks/tv/:token. No
// session: the token picks the webhook and the secret in the message proves
// it. TradingView sends JSON, or plain text when the message isn't JSON.
import express, { Router, type Router as ExpressRouter } from 'express';
import { clientIp, handleAlert } from './webhook.service.js';

export const tvHooksRouter: ExpressRouter = Router();
tvHooksRouter.post('/:token', express.text({ type: ['text/*'], limit: '16kb' }), async (req, res) => {
  const token = String(req.params.token ?? '');
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    res.status(404).json({ ok: false, message: 'Unknown webhook' });
    return;
  }
  const r = await handleAlert(token, req.body, clientIp(req.get('x-forwarded-for'), req.socket.remoteAddress));
  res.status(r.httpStatus).json(r.body);
});
