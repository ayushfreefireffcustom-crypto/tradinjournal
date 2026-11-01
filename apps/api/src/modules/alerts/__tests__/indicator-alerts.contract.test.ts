import { describe, expect, it } from 'vitest';
import { INDICATOR_ALERT_OPERATORS, notificationGroupOf, notificationKindFilter } from '@tradinjournal/contracts';
import { OPERATORS } from '@tradinjournal/core';

describe('indicator alert contract', () => {
  it('accepts exactly the operators the engine evaluates', () => {
    expect([...INDICATOR_ALERT_OPERATORS]).toEqual([...OPERATORS]);
  });
  it('files indicator alerts under News & alerts', () => {
    expect(notificationGroupOf('indicator_alert')).toBe('news');
    expect(notificationKindFilter('news').in).toContain('indicator_alert');
  });
});
