import React from 'react';
import { Box, Text } from 'ink';
import { COLORS } from '../../utils/colors.js';
import { t } from '../../i18n/index.js';
import { formatDate } from '../../utils/format.js';
import type { Profile } from '../../lib/profiles/types.js';
import { SPACING } from '../../utils/spacing.js';
import { useVisibleRows } from '../../hooks/use-visible-rows.js';

interface ProfileDetailModeProps {
  profile: Profile;
}

export function ProfileDetailMode({ profile }: ProfileDetailModeProps) {
  // Header (~3 lines) + 2 section titles + hint row. Split remaining rows
  // proportionally between formulae and casks so neither hides the other.
  const totalRows = useVisibleRows({
    reservedRows: 7,
    fallbackReservedRows: 14,
    minRows: 2,
  });
  const total = profile.formulae.length + profile.casks.length;
  const formulaeBudget = total === 0
    ? 0
    : Math.min(profile.formulae.length, Math.max(1, Math.round((profile.formulae.length / total) * totalRows)));
  const casksBudget = Math.max(0, totalRows - formulaeBudget);
  const visibleFormulae = profile.formulae.slice(0, formulaeBudget);
  const visibleCasks = profile.casks.slice(0, casksBudget);
  const formulaeHidden = profile.formulae.length - visibleFormulae.length;
  const casksHidden = profile.casks.length - visibleCasks.length;

  return (
    <Box flexDirection="column">
      <Text bold color={COLORS.gold}>{profile.name}</Text>
      <Text color={COLORS.muted} wrap="wrap">{profile.description}</Text>
      <Text color={COLORS.muted}>{t('profiles_created', { date: formatDate(profile.createdAt) })}</Text>
      <Box marginTop={SPACING.xs} flexDirection="column">
        <Text bold>{t('profiles_formulaeCount', { count: profile.formulae.length })}</Text>
        <Box paddingLeft={SPACING.sm} flexDirection="column">
          {visibleFormulae.map((f) => (
            <Text key={f} color={COLORS.muted}>{f}</Text>
          ))}
          {formulaeHidden > 0 && (
            <Text color={COLORS.textSecondary} italic>{t('common_andMore', { count: formulaeHidden })}</Text>
          )}
        </Box>
        <Text bold>{t('profiles_casksCount', { count: profile.casks.length })}</Text>
        <Box paddingLeft={SPACING.sm} flexDirection="column">
          {visibleCasks.map((c) => (
            <Text key={c} color={COLORS.muted}>{c}</Text>
          ))}
          {casksHidden > 0 && (
            <Text color={COLORS.textSecondary} italic>{t('common_andMore', { count: casksHidden })}</Text>
          )}
        </Box>
      </Box>
      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.textSecondary}>esc:{t('hint_back')} e:{t('hint_edit')} i:{t('hint_importProfile')}</Text>
      </Box>
    </Box>
  );
}
