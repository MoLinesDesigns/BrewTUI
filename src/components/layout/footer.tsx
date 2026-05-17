import React from 'react';
import { Box, Text } from 'ink';
import { useNavigationStore } from '../../stores/navigation-store.js';
import { useTerminalSize } from '../../hooks/use-terminal-size.js';
import { COLORS } from '../../utils/colors.js';
import { t, useLocaleStore } from '../../i18n/index.js';
import type { ViewId } from '../../lib/types.js';
import type { TranslationKey } from '../../i18n/en.js';
import { SPACING } from '../../utils/spacing.js';

// HintDef: numbered actions render as `1:label`; named keys (enter, esc, /,
// j/k, etc.) render literally so the contextual semantics survive.
type HintDef = [key: string, action: TranslationKey];

const VIEW_HINT_DEFS: Record<ViewId, HintDef[]> = {
  dashboard: [['1', 'hint_refresh']],
  installed: [['/', 'hint_filter'], ['enter', 'hint_info'], ['1', 'hint_uninstall'], ['2', 'hint_switchTab']],
  search: [['enter', 'hint_details'], ['1', 'hint_install']],
  outdated: [['enter', 'hint_upgrade'], ['1', 'hint_upgradeAll'], ['2', 'hint_pin'], ['3', 'hint_refresh']],
  'package-info': [['1', 'hint_install'], ['2', 'hint_uninstall'], ['3', 'hint_upgrade']],
  services: [['1', 'hint_start'], ['2', 'hint_stop'], ['3', 'hint_restart'], ['4', 'hint_refresh']],
  doctor: [['1', 'hint_refresh']],
  profiles: [['enter', 'hint_details'], ['1', 'hint_new'], ['2', 'hint_edit'], ['3', 'hint_import'], ['4', 'hint_delete']],
  'smart-cleanup': [['enter', 'hint_toggle'], ['1', 'hint_all'], ['2', 'hint_clean'], ['3', 'hint_force'], ['4', 'hint_refresh']],
  history: [['/', 'hint_search'], ['enter', 'hint_replay'], ['1', 'hint_filter'], ['2', 'hint_clear']],
  'security-audit': [['enter', 'hint_details'], ['1', 'hint_scan'], ['2', 'hint_upgrade']],
  rollback: [['j/k', 'hint_navigate'], ['enter', 'hint_select'], ['1', 'hint_rollback_confirm']],
  brewfile: [['1', 'hint_new'], ['2', 'hint_refresh'], ['3', 'hint_reconcile']],
  sync: [['1', 'hint_sync'], ['2', 'hint_refresh'], ['3', 'hint_conflict'], ['4', 'hint_useLocal']],
  compliance: [['1', 'hint_scan'], ['2', 'hint_import'], ['3', 'hint_export'], ['4', 'hint_clean']],
  account: [['1', 'hint_promo'], ['2', 'hint_deactivate']],
};

// Views with no per-view actions only show globals + the chooser line is
// suppressed because there is nothing to choose from.
function hasNumberedActions(defs: HintDef[]): boolean {
  return defs.some(([key]) => /^\d+$/.test(key));
}

function HintItem({ def }: { def: HintDef }) {
  return (
    <>
      <Text color={COLORS.text} bold>{def[0]}</Text>
      <Text color={COLORS.textSecondary}>:</Text>
      <Text color={COLORS.gold} dimColor>{t(def[1])}</Text>
    </>
  );
}

export function Footer() {
  const currentView = useNavigationStore((s) => s.currentView);
  const menuMode = useNavigationStore((s) => s.menuMode);
  const locale = useLocaleStore((s) => s.locale);
  const { rows } = useTerminalSize();
  const defs = VIEW_HINT_DEFS[currentView] ?? [];
  // Drop the explanatory "choose a number" line on short terminals — the hint
  // bar below already shows `1:`, `2:` etc. so the extra row is redundant.
  const showChoose = hasNumberedActions(defs) && !menuMode && rows >= 26;

  return (
    <Box flexDirection="column">
      {showChoose && (
        <Box paddingX={SPACING.xs}>
          <Text color={COLORS.text}>{t('hint_chooseNumber')}</Text>
        </Box>
      )}
      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={COLORS.gold} paddingX={SPACING.xs} flexWrap="wrap">
        {!menuMode && defs.map((def, i) => (
          <React.Fragment key={`${def[0]}:${def[1]}`}>
            {i > 0 && <Text color={COLORS.border}> {'│'} </Text>}
            <HintItem def={def} />
          </React.Fragment>
        ))}
        {!menuMode && defs.length > 0 && <Text color={COLORS.border}> {'│'} </Text>}
        <Text color={COLORS.text} bold>esc</Text>
        <Text color={COLORS.textSecondary}>:</Text>
        <Text color={COLORS.gold} dimColor>{t('hint_back')}</Text>
        <Text color={COLORS.border}> {'│'} </Text>
        <Text color={COLORS.text} bold>q</Text>
        <Text color={COLORS.textSecondary}>:</Text>
        <Text color={COLORS.gold} dimColor>{t('hint_quit')}</Text>
        <Text color={COLORS.lavender}> {'┃'} </Text>
        <Text color={COLORS.text} bold>L</Text>
        <Text color={COLORS.textSecondary}>:</Text>
        <Text color={COLORS.gold} dimColor>{t('hint_lang')}({locale})</Text>
      </Box>
    </Box>
  );
}
