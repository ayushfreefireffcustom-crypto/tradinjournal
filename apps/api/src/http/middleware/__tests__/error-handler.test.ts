import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../error-handler.js';

describe('errorHandler', () => {
  it('answers malformed or oversized JSON with 400 / 413, not 500', async () => {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    app.post('/x', (_req, res) => void res.json({ ok: true }));
    app.post('/boom', () => { throw new Error('secret internals'); });
    app.use(errorHandler);
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (path: string, body: string) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    try {
      const bad = await post('/x', '{nope');
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: { code: 'BAD_REQUEST', message: 'Malformed request body' } });
      expect((await post('/x', '"a bare string"')).status).toBe(400);
      expect((await post('/x', JSON.stringify({ a: 'x'.repeat(2000) }))).status).toBe(413);
      expect((await post('/x', '{}')).status).toBe(200);
      // Anything else is still a 500 that hides the message.
      const boom = await post('/boom', '{}');
      expect(boom.status).toBe(500);
      expect(JSON.stringify(await boom.json())).not.toContain('secret internals');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
