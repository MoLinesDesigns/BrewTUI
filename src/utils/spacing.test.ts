import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, getLayoutMode } from './spacing.js';

describe('getLayoutMode', () => {
  it('maps below narrow to single', () => {
    expect(getLayoutMode(0)).toBe('single');
    expect(getLayoutMode(BREAKPOINTS.narrow - 1)).toBe('single');
  });

  it('maps narrow..mid to compact', () => {
    expect(getLayoutMode(BREAKPOINTS.narrow)).toBe('compact');
    expect(getLayoutMode(BREAKPOINTS.mid - 1)).toBe('compact');
  });

  it('maps mid..wide to comfortable', () => {
    expect(getLayoutMode(BREAKPOINTS.mid)).toBe('comfortable');
    expect(getLayoutMode(BREAKPOINTS.wide - 1)).toBe('comfortable');
  });

  it('maps >= wide to wide', () => {
    expect(getLayoutMode(BREAKPOINTS.wide)).toBe('wide');
    expect(getLayoutMode(9999)).toBe('wide');
  });
});
