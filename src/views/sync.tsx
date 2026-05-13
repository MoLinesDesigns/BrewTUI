import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useSyncStore } from '../stores/sync-store.js';
import { useLicenseStore } from '../stores/license-store.js';
import { useNavigationStore } from '../stores/navigation-store.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SectionHeader } from '../components/common/section-header.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { Loading } from '../components/common/loading.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t } from '../i18n/index.js';
import type { SyncConflict } from '../lib/sync/types.js';
import { SPACING } from '../utils/spacing.js';

type Phase = 'overview' | 'confirming-sync' | 'syncing' | 'conflicts' | 'confirming-apply' | 'result';

type ConflictResolution = 'use-local' | 'use-remote' | 'pending';

interface ConflictEntry {
  conflict: SyncConflict;
  resolution: ConflictResolution;
}

function OverviewSection({
  config,
  lastResult,
  conflicts,
  onSyncNow: _onSyncNow,
  onGoToConflicts: _onGoToConflicts,
}: {
  config: ReturnType<typeof useSyncStore.getState>['config'];
  lastResult: ReturnType<typeof useSyncStore.getState>['lastResult'];
  conflicts: SyncConflict[];
  onSyncNow: () => void;
  onGoToConflicts: () => void;
}) {
  const hasConflicts = conflicts.length > 0;
  const showComplianceHint = !hasConflicts && !!lastResult?.success;

  return (
    <Box flexDirection="column" marginTop={SPACING.xs}>
      {config ? (
        <>
          <Box marginBottom={SPACING.xs}>
            <Text color={COLORS.textSecondary}>{t('sync_machine', { name: config.machineName })}</Text>
          </Box>
          {config.lastSync && (
            <Box marginBottom={SPACING.xs}>
              <Text color={COLORS.textSecondary}>
                {t('sync_last_sync', { date: new Date(config.lastSync).toLocaleString() })}
              </Text>
            </Box>
          )}
          {hasConflicts ? (
            <ResultBanner
              status="error"
              message={t('sync_status_conflict', { count: String(conflicts.length) })}
            />
          ) : lastResult?.success ? (
            <ResultBanner status="success" message={t('sync_status_ok')} />
          ) : null}
        </>
      ) : (
        <Box marginBottom={SPACING.xs}>
          <Text color={COLORS.textSecondary}>{t('sync_disabled')}</Text>
        </Box>
      )}

      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.textSecondary}>
          {'s'}<Text color={COLORS.gold}>:{t('hint_sync')}</Text>
          {hasConflicts && (
            <>
              {'  c'}<Text color={COLORS.gold}>:{t('hint_conflict')}</Text>
            </>
          )}
          {showComplianceHint && (
            <>
              {'  c'}<Text color={COLORS.gold}>:{t('hint_check_compliance')}</Text>
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}

function ConflictsList({
  entries,
  cursor,
}: {
  entries: ConflictEntry[];
  cursor: number;
}) {
  return (
    <Box flexDirection="column" marginTop={SPACING.xs}>
      {entries.map((entry, i) => {
        const { conflict, resolution } = entry;
        const isActive = i === cursor;
        return (
          <Box key={`${conflict.packageName}-${conflict.remoteMachine}`} flexDirection="column" marginBottom={SPACING.xs}>
            <SelectableRow isCurrent={isActive}>
              <Text bold color={isActive ? COLORS.text : COLORS.textSecondary}>
                {t('sync_conflict_title', { package: conflict.packageName })}
              </Text>
              <Text color={COLORS.muted}> ({conflict.packageType})</Text>
            </SelectableRow>
            <Box marginLeft={SPACING.sm} flexDirection="column">
              <Text
                color={resolution === 'use-local' ? COLORS.success : COLORS.textSecondary}
              >
                {'l '}{t('sync_conflict_local', { version: conflict.localVersion })}
                {resolution === 'use-local' && ' ✓'}
              </Text>
              <Text
                color={resolution === 'use-remote' ? COLORS.success : COLORS.textSecondary}
              >
                {'r '}{t('sync_conflict_remote', { machine: conflict.remoteMachine, version: conflict.remoteVersion })}
                {resolution === 'use-remote' && ' ✓'}
              </Text>
            </Box>
          </Box>
        );
      })}
      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.textSecondary}>
          j/k:{t('hint_navigate')}  l:{t('sync_conflict_use_local')}  r:{t('sync_conflict_use_remote')}  enter:{t('hint_apply')}  esc:{t('hint_back')}
        </Text>
      </Box>
    </Box>
  );
}

export function SyncView() {
  const isPro = useLicenseStore((s) => s.isPro);
  const navigate = useNavigationStore((s) => s.navigate);
  const { config, lastResult, conflicts, loading, error, initialize, syncNow, resolveConflicts } =
    useSyncStore();

  const [phase, setPhase] = useState<Phase>('overview');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflictEntries, setConflictEntries] = useState<ConflictEntry[]>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    void initialize(isPro());
  }, []);

  // When store conflicts change, populate entries
  useEffect(() => {
    if (conflicts.length > 0) {
      setConflictEntries(
        conflicts.map((c) => ({ conflict: c, resolution: 'pending' as ConflictResolution })),
      );
    }
  }, [conflicts]);

  const handleSyncNow = useCallback(async () => {
    setPhase('syncing');
    setSyncError(null);
    await syncNow(isPro());
    // After sync, check for conflicts or success
    const state = useSyncStore.getState();
    if (state.conflicts.length > 0) {
      setPhase('conflicts');
    } else if (state.error) {
      setSyncError(state.error);
      setPhase('result');
    } else {
      setPhase('result');
    }
  }, [isPro, syncNow]);

  const handleApplyResolutions = useCallback(async () => {
    const pending = conflictEntries.filter((e) => e.resolution === 'pending');
    if (pending.length > 0) return; // All must be resolved before applying

    const resolutions = conflictEntries.map((e) => ({
      conflict: e.conflict,
      resolution: e.resolution as 'use-local' | 'use-remote',
    }));

    await resolveConflicts(resolutions);
    setPhase('result');
  }, [conflictEntries, resolveConflicts]);

  useViewInput((input, key) => {
    if (phase === 'syncing') return;
    if (phase === 'confirming-sync' || phase === 'confirming-apply') return;

    if (phase === 'result') {
      if (key.escape || input === 'r') {
        setPhase('overview');
        setSyncError(null);
        void initialize(isPro());
      }
      return;
    }

    if (phase === 'conflicts') {
      if (key.escape) { setPhase('overview'); return; }

      if (input === 'j' || key.downArrow) {
        setCursor((c) => Math.min(c + 1, conflictEntries.length - 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setCursor((c) => Math.max(c - 1, 0));
        return;
      }

      if (input === 'l') {
        setConflictEntries((prev) =>
          prev.map((e, i) => (i === cursor ? { ...e, resolution: 'use-local' } : e)),
        );
        return;
      }
      if (input === 'r') {
        setConflictEntries((prev) =>
          prev.map((e, i) => (i === cursor ? { ...e, resolution: 'use-remote' } : e)),
        );
        return;
      }

      if (key.return) {
        const pending = conflictEntries.filter((e) => e.resolution === 'pending');
        if (pending.length === 0) setPhase('confirming-apply');
        return;
      }
    }

    // phase === 'overview'
    if (input === 's' || input === '1') {
      setPhase('confirming-sync');
      return;
    }
    if ((input === 'c' || input === '3') && conflicts.length > 0) {
      setCursor(0);
      setPhase('conflicts');
      return;
    }
    if ((input === 'c' || input === '3') && lastResult?.success) {
      navigate('compliance');
      return;
    }
    if (input === 'r' || input === '2') {
      void initialize(isPro());
      return;
    }
  });

  if (phase === 'confirming-sync') {
    return (
      <ConfirmDialog
        message={t('confirm_sync_now')}
        onConfirm={() => { void handleSyncNow(); }}
        onCancel={() => { setPhase('overview'); }}
      />
    );
  }

  if (phase === 'confirming-apply') {
    return (
      <ConfirmDialog
        message={t('confirm_sync_apply', { count: String(conflictEntries.length) })}
        onConfirm={() => { void handleApplyResolutions(); }}
        onCancel={() => { setPhase('conflicts'); }}
      />
    );
  }

  if (phase === 'syncing' || loading) {
    return <Loading message={t('sync_syncing')} />;
  }

  if (phase === 'result') {
    const isError = !!(syncError ?? error);
    return (
      <Box flexDirection="column" marginTop={SPACING.xs}>
        <SectionHeader emoji="🔄" title={t('sync_title')} gradient={GRADIENTS.gold} />
        <Box marginTop={SPACING.xs}>
          <ResultBanner
            status={isError ? 'error' : 'success'}
            message={
              isError
                ? t('sync_error', { error: syncError ?? error ?? '' })
                : t('sync_success')
            }
          />
        </Box>
        <Box marginTop={SPACING.xs}>
          <Text color={COLORS.textSecondary}>r:{t('hint_refresh')}  esc:{t('hint_back')}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <SectionHeader emoji="🔄" title={t('sync_title')} gradient={GRADIENTS.gold} />

      {error && phase === 'overview' && (
        <Box marginTop={SPACING.xs}>
          <ResultBanner status="error" message={t('sync_error', { error })} />
        </Box>
      )}

      {phase === 'overview' && (
        <OverviewSection
          config={config}
          lastResult={lastResult}
          conflicts={conflicts}
          onSyncNow={() => void handleSyncNow()}
          onGoToConflicts={() => { setCursor(0); setPhase('conflicts'); }}
        />
      )}

      {phase === 'conflicts' && (
        <Box flexDirection="column">
          <SectionHeader emoji="⚠" title={t('sync_status_conflict', { count: String(conflictEntries.length) })} gradient={GRADIENTS.gold} />
          <ConflictsList entries={conflictEntries} cursor={cursor} />
        </Box>
      )}
    </Box>
  );
}
