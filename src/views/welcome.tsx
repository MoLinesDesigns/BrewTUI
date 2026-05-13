import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { GradientText } from '../utils/gradient.js';
import { SPACING } from '../utils/spacing.js';
import { t } from '../i18n/index.js';
import { markOnboardingComplete } from '../lib/onboarding.js';

interface WelcomeViewProps {
  onContinue: () => void;
}

// UX-002: shown once on first run. The list mirrors the keys the footer hint
// bar surfaces, so the user's mental model on entry matches the running app.
export function WelcomeView({ onContinue }: WelcomeViewProps) {
  useEffect(() => {
    return () => { /* cleanup not required */ };
  }, []);

  useViewInput((input, key) => {
    if (key.return || input === ' ' || key.escape) {
      void markOnboardingComplete().finally(onContinue);
    }
  });

  return (
    <Box flexDirection="column" paddingY={SPACING.md} paddingX={SPACING.lg}>
      <Box>
        <GradientText colors={GRADIENTS.gold} bold>{t('welcome_title')}</GradientText>
      </Box>

      <Box marginTop={SPACING.sm}>
        <Text color={COLORS.text}>{t('welcome_intro')}</Text>
      </Box>

      <Box flexDirection="column" marginTop={SPACING.sm}>
        <Text color={COLORS.muted}>{t('welcome_keysHeader')}</Text>
        <Box flexDirection="column" paddingLeft={SPACING.sm} marginTop={SPACING.xs}>
          <Text><Text color={COLORS.gold} bold>m</Text>       {t('welcome_keyMenu')}</Text>
          <Text><Text color={COLORS.gold} bold>{'↑ ↓'}</Text>     {t('welcome_keyMove')}</Text>
          <Text><Text color={COLORS.gold} bold>1-9</Text>     {t('welcome_keyAction')}</Text>
          <Text><Text color={COLORS.gold} bold>Enter</Text>   {t('welcome_keySelect')}</Text>
          <Text><Text color={COLORS.gold} bold>S</Text>       {t('welcome_keySearch')}</Text>
          <Text><Text color={COLORS.gold} bold>Esc</Text>     {t('welcome_keyBack')}</Text>
          <Text><Text color={COLORS.gold} bold>L</Text>       {t('welcome_keyLocale')}</Text>
          <Text><Text color={COLORS.gold} bold>q</Text>       {t('welcome_keyQuit')}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={SPACING.sm}>
        <Text color={COLORS.muted}>{t('welcome_proHeader')}</Text>
        <Box paddingLeft={SPACING.sm}>
          <Text color={COLORS.textSecondary}>{t('welcome_proIntro')}</Text>
        </Box>
      </Box>

      <Box marginTop={SPACING.md}>
        <Text color={COLORS.success} bold>{t('welcome_continueHint')}</Text>
      </Box>
    </Box>
  );
}
