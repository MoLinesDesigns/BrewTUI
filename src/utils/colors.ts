/**
 * Semantic color tokens for BrewTUI-Bar.
 *
 * These constants provide a single source of truth for UI colors.
 * Views should gradually adopt these instead of hardcoded hex strings.
 *
 * NO_COLOR support: when the standard NO_COLOR env var is set to any
 * non-empty value (https://no-color.org), every token is replaced by
 * the empty string so Ink renders plain text without ANSI escapes.
 * Callers continue to pass `color={COLORS.success}` unchanged.
 *
 * DS-005 light-terminal support: COLORFGBG is the de-facto signal terminals
 * publish about their fg/bg luminosity. When the bg is light we swap in a
 * second palette tuned for legibility on white. Override with
 * BREW_TUI_THEME=dark|light if the heuristic is wrong.
 */
const DARK_PALETTE = {
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#06B6D4',
  brand: '#FF6B2B',
  muted: '#9CA3AF',
  text: '#F9FAFB',
  textSecondary: '#6B7280',
  teal: '#2DD4BF',
  sky: '#38BDF8',
  gold: '#FFD700',
  goldOrange: '#FFA500',
  goldDeep: '#B8860B',
  goldDark: '#8B6914',
  goldDeepest: '#6B4F10',
  purple: '#A855F7',
  blue: '#3B82F6',
  lavender: '#C4B5FD',
  border: '#4B5563',
  white: '#FFFFFF',
} as const;

const LIGHT_PALETTE = {
  success: '#15803D',
  error: '#B91C1C',
  warning: '#B45309',
  info: '#0E7490',
  brand: '#C2410C',
  muted: '#4B5563',
  text: '#111827',
  textSecondary: '#374151',
  teal: '#0F766E',
  sky: '#0369A1',
  gold: '#A16207',
  goldOrange: '#9A3412',
  goldDeep: '#7C2D12',
  goldDark: '#5B2509',
  goldDeepest: '#3F1A06',
  purple: '#6B21A8',
  blue: '#1D4ED8',
  lavender: '#6D28D9',
  border: '#D1D5DB',
  white: '#000000', // intentional: "white-on-light" reads as black ink
} as const;

type ColorKey = keyof typeof DARK_PALETTE;

function detectTheme(): 'dark' | 'light' {
  const override = process.env['BREW_TUI_THEME'];
  if (override === 'dark' || override === 'light') return override;

  // COLORFGBG is "<fg>;<bg>" or "<fg>;<default>;<bg>" — the bg index decides.
  const cfb = process.env['COLORFGBG'];
  if (cfb) {
    const parts = cfb.split(';');
    const bg = Number(parts[parts.length - 1]);
    if (!isNaN(bg) && bg >= 7) return 'light';
    if (!isNaN(bg) && bg <= 6) return 'dark';
  }
  return 'dark';
}

const PALETTE = detectTheme() === 'light' ? LIGHT_PALETTE : DARK_PALETTE;

function isNoColorRequested(): boolean {
  const v = process.env['NO_COLOR'];
  return typeof v === 'string' && v.length > 0;
}

export const NO_COLOR = isNoColorRequested();
export const THEME = detectTheme();

export const COLORS: Record<ColorKey, string> = NO_COLOR
  ? (Object.fromEntries(
      (Object.keys(PALETTE) as ColorKey[]).map((k) => [k, '']),
    ) as Record<ColorKey, string>)
  : (PALETTE as Record<ColorKey, string>);
