import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useNavigationStore, MENU_VIEWS } from '../../stores/navigation-store.js';
import { isProView, isTeamView } from '../../lib/license/feature-gate.js';
import { COLORS } from '../../utils/colors.js';
import { t, useLocaleStore } from '../../i18n/index.js';
import { GradientText, GRADIENTS } from '../../utils/gradient.js';
import type { ViewId } from '../../lib/types.js';
import type { TranslationKey } from '../../i18n/en.js';
import { SPACING } from '../../utils/spacing.js';

// BREW portion (cols 0-27) and TUI portion (cols 28+) rendered in different colors
const LOGO_BREW = [
  '╭━━╮╱╭━━━╮╭━━━╮╭╮╭╮╭╮╱╱╱╱╱╱╱',
  '┃╭╮┃╱┃╭━╮┃┃╭━━╯┃┃┃┃┃┃╱╱╱╱╱╱╱',
  '┃╰╯╰╮┃╰━╯┃┃╰━━╮┃┃┃┃┃┃╱╱╱╱╱╱╱',
  '┃╭━╮┃┃╭╮╭╯┃╭━━╯┃╰╯╰╯┃╭━━┳━━╮',
  '┃╰━╯┃┃┃┃╰╮┃╰━━╮╰╮╭╮╭╯╰━━┻━━╯',
  '╰━━━╯╰╯╰━╯╰━━━╯╱╰╯╰╯╱╱╱╱╱╱╱╱',
];
const LOGO_TUI = [
  '╭━━━━╮╭╮╱╭╮╭━━╮',
  '┃╭╮╭╮┃┃┃╱┃┃╰┫┣╯',
  '╰╯┃┃╰╯┃┃╱┃┃╱┃┃',
  '╱╱┃┃╱╱┃┃╱┃┃╱┃┃',
  '╱╱┃┃╱╱┃╰━╯┃╭┫┣╮',
  '╱╱╰╯╱╱╰━━━╯╰━━╯',
];

const VIEW_LABEL_KEYS: Record<ViewId, TranslationKey> = {
  dashboard: 'view_dashboard',
  installed: 'view_installed',
  search: 'view_search',
  outdated: 'view_outdated',
  'package-info': 'view_packageInfo',
  services: 'view_services',
  doctor: 'view_doctor',
  profiles: 'view_profiles',
  'smart-cleanup': 'view_smartCleanup',
  history: 'view_history',
  rollback: 'view_rollback',
  brewfile: 'view_brewfile',
  sync: 'view_sync',
  'security-audit': 'view_securityAudit',
  compliance: 'view_compliance',
  account: 'view_account',
};

interface MenuItemProps {
  view: ViewId;
  currentView: ViewId;
  cursorView: ViewId | null;
  menuMode: boolean;
}

function MenuItem({ view, currentView, cursorView, menuMode }: MenuItemProps) {
  const viewLabel = t(VIEW_LABEL_KEYS[view]);
  const isPro = isProView(view) || isTeamView(view);
  const isCurrent = view === currentView;
  const isCursor = menuMode && view === cursorView;
  const isAccount = view === 'account';

  const indicatorColor = isCursor ? COLORS.brand : COLORS.success;
  const labelColor = isCursor
    ? COLORS.brand
    : isCurrent
      ? COLORS.success
      : isAccount
        ? COLORS.gold
        : COLORS.textSecondary;

  // Show only one arrow at a time: cursor while in menu mode, otherwise the
  // current view. Two arrows make the highlight ambiguous.
  const showArrow = menuMode ? isCursor : isCurrent;

  return (
    <Box>
      {showArrow ? (
        <Text color={indicatorColor} bold>{'▶'} </Text>
      ) : (
        <Text>  </Text>
      )}
      <Text bold={showArrow} underline={!menuMode && isCurrent} color={labelColor}>{viewLabel}</Text>
      {isPro && <Text color={COLORS.brand} bold> {t('pro_badge')}</Text>}
    </Box>
  );
}

const COL1_VIEWS = MENU_VIEWS.slice(0, 6);
const COL2_VIEWS = MENU_VIEWS.slice(6);

export function Header() {
  const currentView = useNavigationStore((s) => s.currentView);
  const menuMode = useNavigationStore((s) => s.menuMode);
  const menuCursor = useNavigationStore((s) => s.menuCursor);
  useLocaleStore((s) => s.locale);
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const isNarrow = cols < 95;
  const cursorView = menuMode ? (MENU_VIEWS[menuCursor] ?? null) : null;

  const logoBlock = (
    <Box flexDirection="column" flexShrink={0}>
      {LOGO_BREW.map((brew, i) => (
        <Box key={`logo-${i}`}>
          <GradientText colors={GRADIENTS.gold}>{brew}</GradientText>
          <GradientText colors={GRADIENTS.darkGold}>{LOGO_TUI[i]}</GradientText>
        </Box>
      ))}
    </Box>
  );

  const menuBorderColor = menuMode ? COLORS.brand : COLORS.lavender;

  const menuBlock = (
    <Box borderStyle="round" borderColor={menuBorderColor} paddingX={SPACING.xs} flexDirection="column" alignSelf={isNarrow ? 'flex-start' : 'center'}>
      <Box flexDirection="row">
        <Box flexDirection="column">
          {COL1_VIEWS.map((view) => (
            <MenuItem key={view} view={view} currentView={currentView} cursorView={cursorView} menuMode={menuMode} />
          ))}
        </Box>
        <Box flexDirection="column" marginLeft={SPACING.sm}>
          {COL2_VIEWS.map((view) => (
            <MenuItem key={view} view={view} currentView={currentView} cursorView={cursorView} menuMode={menuMode} />
          ))}
        </Box>
      </Box>
      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={menuBorderColor} marginTop={SPACING.none}>
        {menuMode ? (
          <Text color={COLORS.brand}>{t('hint_menuMode')}</Text>
        ) : (
          <Text color={COLORS.textSecondary}>{t('hint_menuOpen')}</Text>
        )}
      </Box>
    </Box>
  );

  if (isNarrow) {
    return (
      <Box flexDirection="column" paddingX={SPACING.xs}>
        {logoBlock}
        <Box marginTop={SPACING.xs}>{menuBlock}</Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" paddingX={SPACING.xs} alignItems="center">
      {logoBlock}
      <Box marginLeft={SPACING.sm}>{menuBlock}</Box>
    </Box>
  );
}
