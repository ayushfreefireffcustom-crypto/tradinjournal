import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorised, target } from './server.mjs';

test('maps /r/<host>/<path> to an allowed host only', () => {
  assert.equal(target('/r/api.bybit.com/v5/market/tickers?category=linear'), 'https://api.bybit.com/v5/market/tickers?category=linear');
  assert.equal(target('/r/evil.example.com/x'), null);
  assert.equal(target('/r/api.bybit.com.evil.com/x'), null);
  assert.equal(target('/r/169.254.169.254/latest'), null);
  assert.equal(target('/other'), null);
});

test('token must match exactly', () => {
  assert.equal(authorised('a'.repeat(30), 'a'.repeat(30)), true);
  assert.equal(authorised('a'.repeat(29), 'a'.repeat(30)), false);
  assert.equal(authorised(undefined, 'a'.repeat(30)), false);
  assert.equal(authorised('x', ''), false);
});
