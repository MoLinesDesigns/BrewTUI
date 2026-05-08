import React from 'react';
import { Box, Text } from 'ink';
import { useNavigationStore } from '../../stores/navigation-store.js';
import { COLORS } from '../../utils/colors.js';
import { t, useLocaleStore } from '../../i18n/index.js';
import type { ViewId } from '../../lib/types.js';
import type { TranslationKey } from '../../i18n/en.js';
import { SPACING } from '../../utils/spacing.js';

type HintDef = [key: string, action: TranslationKey] | [text: TranslationKey];

const VIEW_HINT_DEFS: Record<ViewId, HintDef[]> = {
  dashboard: [['1-9,0', 'hint_navigate'], ['r', 'hint_refresh'], ['S', 'hint_search'], ['tab', 'hint_next'], ['q', 'hint_quit']],
  installed: [['/', 'hint_filter'], ['enter', 'hint_info'], ['u', 'hint_uninstall'], ['f', 'hint_switchTab'], ['S', 'hint_search'], ['q', 'hint_quit']],
  search: [['hint_typeToSearch'], ['enter', 'hint_details'], ['i', 'hint_install'], ['esc', 'hint_back'], ['q', 'hint_quit']],
  outdated: [['enter', 'hint_upgrade'], ['A', 'hint_upgradeAll'], ['p', 'hint_pin'], ['r', 'hint_refresh'], ['S', 'hint_search'], ['q', 'hint_quit']],
  'package-info': [['i', 'hint_install'], ['u', 'hint_uninstall'], ['U', 'hint_upgrade'], ['esc', 'hint_back'], ['q', 'hint_quit']],
  services: [['s', 'hint_start'], ['x', 'hint_stop'], ['R', 'hint_restart'], ['r', 'hint_refresh'], ['S', 'hint_search'], ['q', 'hint_quit']],
  doctor: [['r', 'hint_refresh'], ['S', 'hint_search'], ['tab', 'hint_next'], ['q', 'hint_quit']],
  profiles: [['n', 'hint_new'], ['enter', 'hint_details'], ['e', 'hint_edit'], ['i', 'hint_import'], ['d', 'hint_delete'], ['q', 'hint_quit']],
  'smart-cleanup': [['enter', 'hint_toggle'], ['a', 'hint_all'], ['c', 'hint_clean'], ['F', 'hint_force'], ['r', 'hint_refresh'], ['S', 'hint_search'], ['q', 'hint_quit']],
  history: [['/', 'hint_search'], ['enter', 'hint_replay'], ['f', 'hint_filter'], ['c', 'hint_clear'], ['q', 'hint_quit']],
  'security-audit': [['r', 'hint_scan'], ['enter', 'hint_details'], ['u', 'hint_upgrade'], ['S', 'hint_search'], ['q', 'hint_quit']],
  rollback: [['j/k', 'hint_navigate'], ['enter', 'hint_select'], ['r', 'hint_rollback_confirm'], ['esc', 'hint_back'], ['q', 'hint_quit']],
  brewfile: [['j/k', 'hint_navigate'], ['a', 'hint_add'], ['d', 'hint_delete'], ['r', 'hint_reconcile'], ['e', 'hint_export'], ['q', 'hint_quit']],
  sync: [['s', 'hint_sync'], ['r', 'hint_refresh'], ['c', 'hint_conflict'], ['l', 'hint_useLocal'], ['esc', 'hint_back'], ['q', 'hint_quit']],
  compliance: [['r', 'hint_scan'], ['i', 'hint_import'], ['e', 'hint_export'], ['c', 'hint_clean'], ['q', 'hint_quit']],
  account: [['p', 'hint_promo'], ['d', 'hint_deactivate'], ['S', 'hint_search'], ['q', 'hint_quit']],
};

function HintItem({ def }: { def: HintDef }) {
  if (def.length === 1) return <Text color={COLORS.gold} dimColor>{t(def[0])}</Text>;
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
  const locale = useLocaleStore((s) => s.locale);
  const defs = VIEW_HINT_DEFS[currentView] ?? [];

  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={COLORS.gold} paddingX={SPACING.xs} flexWrap="wrap">
      {defs.map((def, i) => {
        const key = def.length === 1 ? def[0] : `${def[0]}:${def[1]}`;
        return (
          <React.Fragment key={key}>
            {i > 0 && <Text color={COLORS.border}> {'\u2502'} </Text>}
            <HintItem def={def} />
          </React.Fragment>
        );
      })}
      <Text color={COLORS.lavender}> {'\u2503'} </Text>
      <Text color={COLORS.text} bold>L</Text>
      <Text color={COLORS.textSecondary}>:</Text>
      <Text color={COLORS.gold} dimColor>{t('hint_lang')}({locale})</Text>
    </Box>
  );
}
