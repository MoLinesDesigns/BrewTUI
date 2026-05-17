import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useBrewStore } from '../stores/brew-store.js';
import { useBrewStream } from '../hooks/use-brew-stream.js';
import { pinPackage, unpinPackage, getUpgradeImpact } from '../lib/brew-api.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { StatusBadge } from '../components/common/status-badge.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SectionHeader } from '../components/common/section-header.js';
import { VersionArrow } from '../components/common/version-arrow.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t } from '../i18n/index.js';
import { useDebounce } from '../hooks/use-debounce.js';
import type { UpgradeImpact } from '../lib/impact/types.js';
import { SPACING } from '../utils/spacing.js';
import { writeLastAction } from '../lib/data-dir.js';
import { logger } from '../utils/logger.js';
import { useVisibleRows } from '../hooks/use-visible-rows.js';

function ImpactPanel({ impact }: { impact: UpgradeImpact }) {
  const riskColor =
    impact.risk === 'high' ? COLORS.error
    : impact.risk === 'medium' ? COLORS.warning
    : COLORS.success;

  const riskLabel =
    impact.risk === 'high' ? t('impact_high')
    : impact.risk === 'medium' ? t('impact_medium')
    : t('impact_low');

  const riskIcon =
    impact.risk === 'high' ? '\u26A0'
    : impact.risk === 'medium' ? '~'
    : '\u2713';

  return (
    <Box flexDirection="column" marginTop={SPACING.xs} borderStyle="round" borderColor={riskColor} paddingX={SPACING.sm} paddingY={SPACING.none}>
      <Box>
        <Text bold color={riskColor}>{riskIcon} {riskLabel}</Text>
        {impact.reverseDeps.length > 0 && (
          <Text color={COLORS.textSecondary}> \u2014 {t('impact_affects', { count: impact.reverseDeps.length })}</Text>
        )}
      </Box>
      {impact.riskReasons.length > 0 && (
        <Text color={COLORS.textSecondary}>{impact.riskReasons.join(' \u00B7 ')}</Text>
      )}
      {impact.reverseDeps.length > 0 && impact.reverseDeps.length <= 5 && (
        <Text color={COLORS.muted} dimColor>
          {t('impact_usedBy', { packages: impact.reverseDeps.join(', ') })}
        </Text>
      )}
      {impact.risk === 'high' && (
        <Text color={COLORS.info}>{t('impact_brewfile_hint')}</Text>
      )}
    </Box>
  );
}

export function OutdatedView() {
  const { outdated, loading, errors, fetchOutdated } = useBrewStore();
  const stream = useBrewStream();
  const [cursor, setCursor] = useState(0);
  const [confirmAction, setConfirmAction] = useState<
    | { type: 'single'; name: string }
    | { type: 'all' }
    | null
  >(null);
  const hasRefreshed = useRef(false);
  // Names submitted to `brew upgrade` so that, once the stream finishes and the
  // outdated list is refreshed, we can write the BrewBar handoff with what was
  // actually upgraded plus the remaining outdated count.
  const pendingUpgradeRef = useRef<string[] | null>(null);
  const [impact, setImpact] = useState<UpgradeImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const listRows = useVisibleRows({
    reservedRows: impact || impactLoading ? 11 : 7,
    fallbackReservedRows: impact || impactLoading ? 18 : 14,
    minRows: 1,
  });
  const streamRows = useVisibleRows({
    reservedRows: 5,
    fallbackReservedRows: 14,
    minRows: 1,
  });

  useEffect(() => { fetchOutdated(); }, []);

  useEffect(() => {
    if (!stream.isRunning && !stream.error && stream.lines.length > 0 && !hasRefreshed.current) {
      hasRefreshed.current = true;
      void fetchOutdated().then(() => {
        const pkgs = pendingUpgradeRef.current;
        if (!pkgs) return;
        pendingUpgradeRef.current = null;
        const state = useBrewStore.getState().outdated;
        const remaining = state.formulae.length + state.casks.length;
        void writeLastAction({
          timestamp: new Date().toISOString(),
          action: 'upgrade',
          packages: pkgs,
          remainingOutdated: remaining,
          source: 'brew-tui',
        }).catch((err) => logger.warn('Failed to write last-action.json', err));
      });
    }
  }, [stream.isRunning, stream.error]);

  // Enrich packages with type so formula/cask distinction is available.
  // useMemo: this list is read on every render to compute cursor bounds and
  // the visible window; the underlying outdated arrays only change on refetch.
  const allOutdated = useMemo(
    () => [
      ...outdated.formulae.map((p) => ({ ...p, type: 'formula' as const })),
      ...outdated.casks.map((p) => ({ ...p, type: 'cask' as const })),
    ],
    [outdated.formulae, outdated.casks],
  );

  const debouncedCursor = useDebounce(cursor, 150);

  useEffect(() => {
    const pkg = allOutdated[debouncedCursor];
    if (!pkg || stream.isRunning) {
      setImpact(null);
      return;
    }
    // SCR-12-O1: each cursor move should invalidate the previous in-flight
    // analysis so a slower one cannot land after a faster newer one and
    // overwrite the panel with stale data.
    let cancelled = false;
    setImpactLoading(true);
    void getUpgradeImpact(
      pkg.name,
      pkg.installed_versions[0] ?? '',
      pkg.current_version,
      pkg.type,
    )
      .then((result) => { if (!cancelled) setImpact(result); })
      .catch(() => { if (!cancelled) setImpact(null); })
      .finally(() => { if (!cancelled) setImpactLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedCursor, stream.isRunning]);

  useViewInput((input, key) => {
    if (stream.isRunning) {
      if (key.escape) stream.cancel();
      return;
    }
    if (stream.lines.length > 0) {
      if (key.escape) {
        stream.clear();
        return;
      }
      if (input === 'r' || input === '3') {
        stream.clear();
        void fetchOutdated();
      }
      return;
    }
    if (confirmAction) return;

    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, Math.max(0, allOutdated.length - 1)));
    } else if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (key.return && allOutdated[cursor]) {
      setConfirmAction({ type: 'single', name: allOutdated[cursor].name });
    } else if ((input === 'A' || input === '1') && allOutdated.length > 0) {
      setConfirmAction({ type: 'all' });
    } else if ((input === 'p' || input === '2') && allOutdated[cursor]) {
      // ARQ-008: Use brew-api functions instead of direct execBrew
      const pkg = allOutdated[cursor];
      void (pkg.pinned ? unpinPackage(pkg.name) : pinPackage(pkg.name)).then(() => void fetchOutdated());
      return;
    } else if (input === 'r' || input === '3') {
      void fetchOutdated();
    }
  });

  const MAX_VISIBLE_ROWS = listRows;
  const start = Math.max(0, cursor - Math.floor(MAX_VISIBLE_ROWS / 2));
  const visible = allOutdated.slice(start, start + MAX_VISIBLE_ROWS);

  if (loading.outdated) return <Loading message={t('loading_outdated')} />;
  if (errors.outdated) return <ErrorMessage message={errors.outdated} />;

  if (stream.isRunning || stream.lines.length > 0) {
    return (
      <Box flexDirection="column">
        <ProgressLog
          lines={stream.lines}
          isRunning={stream.isRunning}
          title={t('outdated_upgrading')}
          maxVisible={streamRows}
        />
        {stream.isRunning && (
          <Text color={COLORS.textSecondary}>esc:{t('hint_cancel')}</Text>
        )}
        {!stream.isRunning && (
          <Box flexDirection="column" marginTop={SPACING.xs}>
            <Box borderStyle="round" borderColor={stream.error ? COLORS.error : COLORS.success} paddingX={SPACING.sm} paddingY={SPACING.none}>
              <Text color={stream.error ? COLORS.error : COLORS.success} bold>
                {stream.error ? `\u2718 ${stream.error}` : `\u2714 ${t('outdated_upgradeComplete')}`}
              </Text>
              <Text color={COLORS.muted}> {t('outdated_pressRefresh')}</Text>
            </Box>
            <Text color={COLORS.textSecondary}>r:{t('hint_refresh')} esc:{t('hint_clear')}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // SCR-012: Build package list for upgrade-all confirmation
  const upgradeAllMessage = confirmAction?.type === 'all'
    ? `${t('outdated_confirmAll', { count: allOutdated.length })}\n${t('outdated_upgradeAllList', { list: allOutdated.map(p => p.name).join(', ') })}`
    : '';

  return (
    <Box flexDirection="column">
      <SectionHeader emoji={'\u{1F4E6}'} title={t('outdated_title', { count: allOutdated.length })} gradient={GRADIENTS.fire} />

      {confirmAction && (
        <Box marginY={SPACING.xs}>
          <ConfirmDialog
            message={
              confirmAction.type === 'all'
                ? upgradeAllMessage
                : t('outdated_confirmSingle', { name: confirmAction.type === 'single' ? confirmAction.name : '' })
            }
            onConfirm={() => {
              hasRefreshed.current = false;
              if (confirmAction.type === 'all') {
                pendingUpgradeRef.current = allOutdated.map((p) => p.name);
                void stream.run(['upgrade']);
              } else if (confirmAction.name) {
                pendingUpgradeRef.current = [confirmAction.name];
                void stream.run(['upgrade', confirmAction.name]);
              }
              setConfirmAction(null);
            }}
            onCancel={() => setConfirmAction(null)}
          />
        </Box>
      )}

      {allOutdated.length === 0 && !confirmAction && (
        <Box marginTop={SPACING.xs}>
          <ResultBanner status="success" message={`\u2714 ${t('outdated_upToDate')}`} />
        </Box>
      )}

      {allOutdated.length > 0 && !confirmAction && (
        <Box flexDirection="column" marginTop={SPACING.xs}>
          {start > 0 && (
            <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreAbove', { count: start })}</Text>
          )}
          {visible.map((pkg, i) => {
            const idx = start + i;
            const isCurrent = idx === cursor;
            return (
              <SelectableRow key={pkg.name} isCurrent={isCurrent}>
                {/* Name takes the remaining row width and truncates in the
                    middle to preserve @suffix tags. flexGrow=1 lets it eat
                    leftover space; flexShrink=1 + minWidth=0 lets it shrink
                    below its content (CSS `min-width: 0`). */}
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text
                    bold={isCurrent}
                    inverse={isCurrent}
                    color={isCurrent ? COLORS.text : COLORS.muted}
                    wrap="truncate-middle"
                  >
                    {pkg.name}
                  </Text>
                </Box>
                <VersionArrow current={pkg.installed_versions[0] ?? ''} latest={pkg.current_version} />
                {pkg.pinned && <StatusBadge label={t('outdated_pinned')} variant="info" />}
              </SelectableRow>
            );
          })}
          {start + MAX_VISIBLE_ROWS < allOutdated.length && (
            <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreBelow', { count: allOutdated.length - start - MAX_VISIBLE_ROWS })}</Text>
          )}

          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.text} bold>
              {cursor + 1}/{allOutdated.length}
            </Text>
          </Box>

          {impact && !stream.isRunning && !confirmAction && (
            <ImpactPanel impact={impact} />
          )}
          {impactLoading && !stream.isRunning && !confirmAction && (
            <Box marginTop={SPACING.xs}>
              <Text color={COLORS.textSecondary}>{t('impact_analyzing')}</Text>
            </Box>
          )}

          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.textSecondary}>{t('impact_hint')}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
