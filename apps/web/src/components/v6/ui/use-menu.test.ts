import { describe, expect, it } from 'vitest';
import { nextIndex } from './use-menu';

const L = ['Dark theme', 'Settings', 'Sign out', 'Support', 'Docs'];

describe('nextIndex', () => {
  it('moves with arrows and wraps at both ends', () => {
    expect(nextIndex('ArrowDown', -1, L)).toBe(0);
    expect(nextIndex('ArrowDown', 4, L)).toBe(0);
    expect(nextIndex('ArrowUp', 0, L)).toBe(4);
    expect(nextIndex('ArrowUp', -1, L)).toBe(4);
    expect(nextIndex('ArrowUp', 2, L)).toBe(1);
  });
  it('jumps with Home and End', () => {
    expect(nextIndex('Home', 3, L)).toBe(0);
    expect(nextIndex('End', 0, L)).toBe(4);
  });
  it('finds the next item by its first letter, cycling on repeats', () => {
    expect(nextIndex('s', 0, L, 's')).toBe(1);
    expect(nextIndex('s', 1, L, 'ss')).toBe(2);
    expect(nextIndex('s', 3, L, 'sss')).toBe(1); // wraps past Docs back to Settings
    expect(nextIndex('d', 1, L, 'd')).toBe(4);
  });
  it('matches a typed prefix from the current item', () => {
    expect(nextIndex('u', 1, L, 'su')).toBe(3);
    expect(nextIndex('i', 1, L, 'si')).toBe(2);
    expect(nextIndex('x', 0, L, 'x')).toBeNull();
  });
  it('ignores other keys and empty menus', () => {
    expect(nextIndex('Enter', 0, L)).toBeNull();
    expect(nextIndex(' ', 0, L, ' ')).toBeNull();
    expect(nextIndex('ArrowDown', -1, [])).toBeNull();
  });
});
