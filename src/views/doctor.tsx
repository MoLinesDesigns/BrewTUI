import React, { useEffect, useRef, useState } from 'react';
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
import { useVisibleRows } from '../hooks/use-visible-rows.js';

export function DoctorView() {
  // PERF-001: selectors granulares — evita re-render ante fetches no usados.
  const doctorWarnings = useBrewStore((s) => s.doctorWarnings);
  const doctorClean = useBrewStore((s) => s.doctorClean);
  const loading = useBrewStore((s) => s.loading);
  const errors = useBrewStore((s) => s.errors);
  const fetchDoctor = useBrewStore((s) => s.fetchDoctor);
  // Each warning renders as a bordered box of several lines. Treat each warning
  // as one logical row for paging; long multi-line warnings still wrap inside.
  const [cursor, setCursor] = useState(0);
  const visibleWarnings = useVisibleRows({
    reservedRows: 6,
    fallbackReservedRows: 14,
    minRows: 1,
  });

  // FE-006: Mounted ref for cleanup
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { fetchDoctor(); }, []);

  useViewInput((input, key) => {
    if (input === 'r' || input === '1') { void fetchDoctor(); return; }
    if (input === 'j' || key.downArrow) setCursor((c) => Math.min(c + 1, Math.max(0, doctorWarnings.length - 1)));
    else if (input === 'k' || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
  });

  if (loading.doctor) return <Loading message={t('loading_doctor')} />;
  if (errors.doctor) return <ErrorMessage message={errors.doctor} />;

  const start = Math.max(0, cursor - Math.floor(visibleWarnings / 2));
  const visible = doctorWarnings.slice(start, start + visibleWarnings);

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

        {start > 0 && (
          <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreAbove', { count: start })}</Text>
        )}
        {visible.map((warning, i) => {
          const idx = start + i;
          return (
            <Box key={`warning-${idx}-${warning.slice(0, 20)}`} flexDirection="column" marginBottom={SPACING.xs} borderStyle="single" borderColor={idx === cursor ? COLORS.gold : COLORS.warning} paddingX={SPACING.xs}>
              {warning.split('\n').map((line, j) => (
                <Text key={`warning-${idx}-${j}-${line.slice(0, 20)}`} color={j === 0 ? COLORS.warning : COLORS.muted} wrap="wrap">{line}</Text>
              ))}
            </Box>
          );
        })}
        {start + visibleWarnings < doctorWarnings.length && (
          <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreBelow', { count: doctorWarnings.length - start - visibleWarnings })}</Text>
        )}
      </Box>

      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.text} bold>
          {doctorWarnings.length > 0 ? tp('plural_warnings', doctorWarnings.length) : ''}
        </Text>
      </Box>
    </Box>
  );
}
