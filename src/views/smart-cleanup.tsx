import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useCleanupStore } from '../stores/cleanup-store.js';
import { useBrewStream } from '../hooks/use-brew-stream.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { StatCard } from '../components/common/stat-card.js';
import { SectionHeader } from '../components/common/section-header.js';
import { COLORS } from '../utils/colors.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t } from '../i18n/index.js';
import { SPACING } from '../utils/spacing.js';
import { useVisibleRows } from '../hooks/use-visible-rows.js';

export function SmartCleanupView() {
  const { summary, selected, loading, error, analyze, toggleSelect, selectAll } = useCleanupStore();
  const [cursor, setCursor] = useState(0);
  const [confirmClean, setConfirmClean] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);
  const [failedNames, setFailedNames] = useState<string[]>([]);
  const stream = useBrewStream();
  const hasRefreshed = useRef(false);
  // StatCards (3 rows) + title + warning/confirm dialog + footer hints.
  const listRows = useVisibleRows({
    reservedRows: confirmClean || confirmForce ? 12 : 9,
    fallbackReservedRows: confirmClean || confirmForce ? 18 : 14,
    minRows: 1,
  });

  useEffect(() => { analyze(); }, []);

  useEffect(() => {
    if (!stream.isRunning && !stream.error && stream.lines.length > 0 && !hasRefreshed.current) {
      hasRefreshed.current = true;
      void analyze();
    }
  }, [stream.isRunning, stream.error]);

  const candidates = summary?.candidates ?? [];

  const isDependencyError = stream.error != null &&
    stream.lines.some((l) => l.includes('Refusing to uninstall') || l.includes('required by'));

  useViewInput((input, key) => {
    if (stream.isRunning) {
      if (key.escape) stream.cancel();
      return;
    }
    if (confirmClean || confirmForce) return;

    // After a dependency error, offer F (or 3) to force
    if ((input === 'F' || input === '3') && isDependencyError && failedNames.length > 0) {
      setConfirmForce(true);
      return;
    }

    if (input === 'r' || input === '4') { stream.clear(); setFailedNames([]); void analyze(); return; }
    if (key.return && candidates[cursor]) {
      toggleSelect(candidates[cursor].name);
      return;
    }
    if (input === 'a' || input === '1') { selectAll(); return; }
    if ((input === 'c' || input === '2') && selected.size > 0) { setConfirmClean(true); return; }

    if (input === 'j' || key.downArrow) setCursor((c) => Math.min(c + 1, Math.max(0, candidates.length - 1)));
    else if (input === 'k' || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
  });

  if (loading) return <Loading message={t('loading_cleanup')} />;
  if (error) return <ErrorMessage message={error} />;

  if (stream.isRunning || stream.lines.length > 0) {
    return (
      <Box flexDirection="column">
        <ProgressLog lines={stream.lines} isRunning={stream.isRunning} title={t('cleanup_cleaning')} />
        {stream.isRunning && (
          <Text color={COLORS.muted}>esc:{t('hint_cancel')}</Text>
        )}

        {!stream.isRunning && !stream.error && (
          <ResultBanner status="success" message={`\u2714 ${t('cleanup_complete')}`} />
        )}

        {!stream.isRunning && stream.error && (
          <Box flexDirection="column" gap={SPACING.xs}>
            <ResultBanner status="error" message={`\u2718 ${t('cleanup_depError')}`} />
            {isDependencyError && failedNames.length > 0 && (
              <Text color={COLORS.warning}>
                F:{t('hint_force')} r:{t('hint_refresh')}
              </Text>
            )}
          </Box>
        )}

        {confirmForce && (
          <Box marginY={SPACING.xs}>
            <ConfirmDialog
              message={t('cleanup_confirmForce', { count: failedNames.length })}
              onConfirm={() => {
                setConfirmForce(false);
                hasRefreshed.current = false;
                stream.clear();
                void stream.run(['uninstall', '--ignore-dependencies', ...failedNames]);
              }}
              onCancel={() => setConfirmForce(false)}
            />
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <SectionHeader emoji={'\u{1F9F9}'} title={t('cleanup_title')} gradient={GRADIENTS.emerald} />

      {summary && (
        <Box gap={SPACING.xs} marginY={SPACING.xs}>
          <StatCard label={t('cleanup_orphans')} value={candidates.length} color={candidates.length > 0 ? COLORS.warning : COLORS.success} />
          <StatCard label={t('cleanup_reclaimable')} value={summary.totalReclaimableFormatted} color={COLORS.sky} />
          <StatCard label={t('cleanup_selected')} value={selected.size} color={selected.size > 0 ? COLORS.success : COLORS.muted} />
        </Box>
      )}

      {/* SCR-001: Two-step confirmation with system tools warning */}
      {confirmClean && (
        <Box flexDirection="column" marginY={SPACING.xs} gap={SPACING.xs}>
          <Box borderStyle="round" borderColor={COLORS.warning} paddingX={SPACING.sm} paddingY={SPACING.none}>
            <Text color={COLORS.warning}>{t('cleanup_warning_system_tools')}</Text>
          </Box>
          <ConfirmDialog
            message={t('cleanup_confirmUninstall', { count: selected.size })}
            onConfirm={() => {
              setConfirmClean(false);
              hasRefreshed.current = false;
              const names = Array.from(selected);
              setFailedNames(names);
              void stream.run(['uninstall', ...names]);
            }}
            onCancel={() => setConfirmClean(false)}
          />
        </Box>
      )}

      {candidates.length === 0 && !confirmClean && (
        <ResultBanner status="success" message={`\u2714 ${t('cleanup_systemClean')}`} />
      )}

      {candidates.length > 0 && !confirmClean && (() => {
        const start = Math.max(0, cursor - Math.floor(listRows / 2));
        const visible = candidates.slice(start, start + listRows);
        return (
          <Box flexDirection="column">
            {start > 0 && (
              <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreAbove', { count: start })}</Text>
            )}
            {visible.map((c, i) => {
              const idx = start + i;
              const isCurrent = idx === cursor;
              const isSelected = selected.has(c.name);
              return (
                <SelectableRow key={c.name} isCurrent={isCurrent}>
                  <Text color={isSelected ? COLORS.success : COLORS.muted}>{isSelected ? '\u2611' : '\u2610'}</Text>
                  <Text bold={isCurrent} inverse={isCurrent} color={isCurrent ? COLORS.text : COLORS.muted}>{c.name}</Text>
                  <Text color={COLORS.warning}>{c.diskUsageFormatted}</Text>
                  <Text color={COLORS.textSecondary}>[{c.reason}]</Text>
                </SelectableRow>
              );
            })}
            {start + listRows < candidates.length && (
              <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreBelow', { count: candidates.length - start - listRows })}</Text>
            )}
            <Box marginTop={SPACING.xs}>
              <Text color={COLORS.text} bold>
                {cursor + 1}/{candidates.length}
              </Text>
            </Box>
          </Box>
        );
      })()}
    </Box>
  );
}
