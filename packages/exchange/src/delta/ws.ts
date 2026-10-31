// Delta India private WebSocket. Ported from MirrorPip-X, where most rules below
// were learned on testnet:
//  - auth is `key-auth` signing `GET + timestamp + /live`, timestamp as a
//    number (the older `type:'auth'` login was removed on 31 Oct 2026);
//  - subscribe only AFTER the auth success arrives, or the subscription is
//    silently dropped;
//  - Delta drops sockets with no activity, so enable heartbeats (one every
//    30 s), ping every 25 s, and treat 40 s of silence as a dead socket.
// Reconnecting is the caller's job: onError fires once per stream.

import type { ApiCredentials, StreamHandle } from '../types.js';
import type { DeltaConfig } from './config.js';
import { deltaSignature } from './rest.js';

/** The part of the WHATWG WebSocket we use (Node 22+ ships one globally). */
export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', cb: () => void): void;
  addEventListener(type: 'message', cb: (ev: { data: unknown }) => void): void;
}
export type WsCtor = new (url: string) => WsLike;

export interface PrivateStreamOptions {
  channels: Array<{ name: string; symbols?: string[] }>;
  onMessage: (msg: Record<string, unknown>) => void;
  onError?: (err: Error) => void;
  pingMs?: number;
  idleMs?: number;
}

const OPEN = 1;

export function openPrivateStream(cfg: DeltaConfig, creds: ApiCredentials, opts: PrivateStreamOptions, WS: WsCtor, nowMs: () => number = Date.now): StreamHandle {
  const pingMs = opts.pingMs ?? 25_000;
  const idleMs = opts.idleMs ?? 40_000;
  const ws = new WS(cfg.wsUrl);
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const clearTimers = () => {
    if (pingTimer) clearInterval(pingTimer);
    if (idleTimer) clearTimeout(idleTimer);
    pingTimer = idleTimer = null;
  };
  const fail = (err: Error) => {
    if (done) return;
    done = true;
    clearTimers();
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    opts.onError?.(err);
  };
  const bumpIdle = () => {
    if (done) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fail(new Error('Delta WS idle timeout')), idleMs);
  };
  const send = (obj: unknown) => {
    if (ws.readyState === OPEN) ws.send(JSON.stringify(obj));
  };

  ws.addEventListener('open', () => {
    const timestamp = Math.floor(nowMs() / 1000);
    const signature = deltaSignature(creds.apiSecret, 'GET', String(timestamp), '/live', '', '');
    send({ type: 'key-auth', payload: { 'api-key': creds.apiKey, signature, timestamp } });
    bumpIdle();
  });

  ws.addEventListener('message', (ev) => {
    bumpIdle();
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (isAuthOk(msg)) {
      send({ type: 'subscribe', payload: { channels: opts.channels.map((c) => ({ name: c.name, symbols: c.symbols ?? ['all'] })) } });
      send({ type: 'enable_heartbeat' });
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ type: 'ping' }), pingMs);
      return;
    }
    if (isAuthFailed(msg)) {
      fail(new Error(`Delta WS authentication failed${msg.status ? ` (${String(msg.status)})` : ''}`));
      return;
    }
    if (msg.type === 'heartbeat' || msg.type === 'pong' || msg.type === 'subscriptions') return;
    opts.onMessage(msg);
  });

  ws.addEventListener('error', () => fail(new Error('Delta WS error')));
  ws.addEventListener('close', () => fail(new Error('Delta WS closed')));

  return {
    close() {
      done = true;
      clearTimers();
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
  };
}

// Success: `{type:'key-auth', success:true, status:'authenticated'}`. Failure
// carries a status such as `invalid_signature` or `ip_not_whitelisted`.
function isAuthOk(msg: Record<string, unknown>): boolean {
  return msg.type === 'key-auth' && msg.success === true;
}

function isAuthFailed(msg: Record<string, unknown>): boolean {
  return msg.type === 'key-auth' && msg.success !== true;
}
