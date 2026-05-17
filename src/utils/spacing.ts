export const SPACING = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 6,
  xxl: 8,
} as const;

// Width breakpoints in columns. Single source of truth for "is the terminal
// narrow / mid / wide" decisions across views. Picked from observed real-world
// terminal sizes: half-screen iTerm panes hover ~60, full-screen ~120-160.
export const BREAKPOINTS = {
  /** Below this we collapse to single-column rows (only the name fits). */
  narrow: 50,
  /** Below this we drop the description column but keep version. */
  mid: 80,
  /** At or above this we render every column comfortably. */
  wide: 120,
} as const;

export type LayoutMode = 'single' | 'compact' | 'comfortable' | 'wide';

/** Map a container width (in columns) to a layout mode. Use this in views to
 * decide how many columns to render, instead of comparing magic numbers in-line. */
export function getLayoutMode(columns: number): LayoutMode {
  if (columns < BREAKPOINTS.narrow) return 'single';
  if (columns < BREAKPOINTS.mid) return 'compact';
  if (columns < BREAKPOINTS.wide) return 'comfortable';
  return 'wide';
}
