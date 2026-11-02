import { describe, expect, it } from 'vitest';
import { trapIndex } from './use-dialog';
import { popSide } from './use-on-screen';

describe('trapIndex', () => {
  it('wraps Tab from the last element to the first', () => {
    expect(trapIndex(2, 3, false)).toBe(0);
  });
  it('wraps Shift+Tab from the first element to the last', () => {
    expect(trapIndex(0, 3, true)).toBe(2);
  });
  it('lets the browser move focus in the middle', () => {
    expect(trapIndex(1, 3, false)).toBeNull();
    expect(trapIndex(1, 3, true)).toBeNull();
  });
  it('pulls focus back in when it is outside the dialog', () => {
    expect(trapIndex(-1, 3, false)).toBe(0);
    expect(trapIndex(-1, 3, true)).toBe(2);
  });
  it('keeps a single element focused', () => {
    expect(trapIndex(0, 1, false)).toBe(0);
    expect(trapIndex(0, 1, true)).toBe(0);
  });
  it('does nothing when nothing can take focus', () => {
    expect(trapIndex(-1, 0, false)).toBeNull();
  });
});

describe('popSide', () => {
  it('keeps a popover that fits', () => {
    expect(popSide({ left: 100, right: 440 }, 768)).toBeNull();
  });
  it('anchors to the start when it hangs off the left', () => {
    expect(popSide({ left: -204, right: 136 }, 768)).toBe('start');
  });
  it('anchors to the end when it hangs off the right', () => {
    expect(popSide({ left: 266, right: 516 }, 390)).toBe('end');
  });
});
