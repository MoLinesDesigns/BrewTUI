import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useBrewStore } from '../stores/brew-store.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SectionHeader } from '../components/common/section-header.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t, tp } from '../i18n/index.js';
import { SPACING } from '../utils/spacing.js';

export function DoctorView() {
  const { doctorWarnings, doctorClean, loading, errors, fetchDoctor } = useBrewStore();

  // FE-006: Mounted ref for cleanup
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { fetchDoctor(); }, []);

  useViewInput((input) => {
    if (input === 'r' || input === '1') void fetchDoctor();
  });

  if (loading.doctor) return <Loading message={t('loading_doctor')} />;
  if (errors.doctor) return <ErrorMessage message={errors.doctor} />;

  return (
    <Box flexDirection="column">
      <SectionHeader emoji={'\u{1FA7A}'} title={t('doctor_title')} gradient={GRADIENTS.emerald} />

      <Box flexDirection="column" marginTop={SPACING.xs}>
        {doctorClean && (
          <ResultBanner status="success" message={`\u2714 ${t('doctor_clean')}`} />
        )}

        {doctorClean === false && doctorWarnings.length === 0 && (
          <Text color={COLORS.warning}>{t('doctor_warningsNotCaptured')}</Text>
        )}

        {doctorWarnings.map((warning, i) => (
          // FE-004: Improved React key
          <Box key={`warning-${i}-${warning.slice(0, 20)}`} flexDirection="column" marginBottom={SPACING.xs} borderStyle="single" borderColor={COLORS.warning} paddingX={SPACING.xs}>
            {warning.split('\n').map((line, j) => (
              <Text key={`warning-${i}-${j}-${line.slice(0, 20)}`} color={j === 0 ? COLORS.warning : COLORS.muted}>{line}</Text>
            ))}
          </Box>
        ))}
      </Box>

      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.text} bold>
          {doctorWarnings.length > 0 ? tp('plural_warnings', doctorWarnings.length) : ''}
        </Text>
      </Box>
    </Box>
  );
}
