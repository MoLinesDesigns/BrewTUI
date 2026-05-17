import React from 'react';
import { Box, Text } from 'ink';
import { COLORS } from '../../utils/colors.js';
import { t } from '../../i18n/index.js';
import type { ViewId } from '../../lib/types.js';
import type { TranslationKey } from '../../i18n/en.js';
import { isTeamView } from '../../lib/license/feature-gate.js';
import { SPACING } from '../../utils/spacing.js';

const FEATURE_KEYS: Record<string, { title: TranslationKey; desc: TranslationKey }> = {
  profiles: { title: 'upgrade_profiles', desc: 'upgrade_profilesDesc' },
  'smart-cleanup': { title: 'upgrade_cleanup', desc: 'upgrade_cleanupDesc' },
  history: { title: 'upgrade_history', desc: 'upgrade_historyDesc' },
  'security-audit': { title: 'upgrade_security', desc: 'upgrade_securityDesc' },
  sync: { title: 'upgrade_sync', desc: 'upgrade_syncDesc' },
  compliance: { title: 'upgrade_compliance', desc: 'upgrade_complianceDesc' },
  rollback: { title: 'upgrade_rollback', desc: 'upgrade_rollbackDesc' },
  brewfile: { title: 'upgrade_brewfile', desc: 'upgrade_brewfileDesc' },
};

interface UpgradePromptProps {
  viewId: ViewId;
}

export function UpgradePrompt({ viewId }: UpgradePromptProps) {
  const keys = FEATURE_KEYS[viewId];
  if (!keys) return null;

  const title = t(keys.title);
  const team = isTeamView(viewId);
  const headerKey: TranslationKey = team ? 'upgrade_teamFeature' : 'upgrade_proFeature';
  const pricingKey: TranslationKey = team ? 'upgrade_teamPricing' : 'upgrade_pricing';
  const buyUrlKey: TranslationKey = team ? 'upgrade_buyUrlTeam' : 'upgrade_buyUrl';
  const labelKey: TranslationKey = team ? 'upgrade_teamLabel' : 'upgrade_proLabel';

  return (
    <Box flexDirection="column" alignItems="center" paddingY={SPACING.xs}>
      <Box
        borderStyle="double"
        borderColor={COLORS.brand}
        paddingX={SPACING.sm}
        paddingY={SPACING.none}
        flexDirection="column"
        alignItems="center"
        flexShrink={1}
        width="80%"
      >
        <Text bold color={COLORS.brand}>{'\u2B50'} {t(headerKey, { title })}</Text>
        <Text color={COLORS.text} wrap="wrap">{t(keys.desc)}</Text>
        <Box flexDirection="column" alignItems="center" marginTop={SPACING.xs}>
          <Text color={COLORS.info} bold>{t(pricingKey)}</Text>
          <Text color={COLORS.muted}>{t('upgrade_buyAt')}</Text>
          <Text color={COLORS.sky} bold>{t(buyUrlKey)}</Text>
          <Text color={COLORS.muted}>{t('upgrade_activateWith')}</Text>
          <Text color={COLORS.success} bold>{t('upgrade_activateCmd')}</Text>
          <Text color={COLORS.brand}>{t(labelKey)}</Text>
        </Box>
      </Box>
    </Box>
  );
}
