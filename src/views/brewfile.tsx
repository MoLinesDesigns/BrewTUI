import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { TextInput } from '@inkjs/ui';
import { useBrewfileStore } from '../stores/brewfile-store.js';
import { useLicenseStore } from '../stores/license-store.js';
import { reconcile } from '../lib/brewfile/brewfile-manager.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SectionHeader } from '../components/common/section-header.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t } from '../i18n/index.js';
import type { DriftReport } from '../lib/brewfile/types.js';
import { SPACING } from '../utils/spacing.js';

type Phase = 'overview' | 'creating' | 'confirming-reconcile' | 'reconciling' | 'result';

// ── DriftScore ────────────────────────────────────────────────────────────────

function DriftScore({ score }: { score: number }) {
  const color = score >= 80 ? COLORS.success : score >= 50 ? COLORS.warning : COLORS.error;
  const bars = Math.round(score / 10);
  const filled = '▓'.repeat(bars);
  const empty = '░'.repeat(10 - bars);
  return (
    <Box>
      <Text color={color}>{filled}{empty}</Text>
      <Text color={color} bold> {score}% </Text>
      <Text color={COLORS.textSecondary}>{t('brewfile_compliant')}</Text>
    </Box>
  );
}

// ── DriftSummary ──────────────────────────────────────────────────────────────

function DriftSummary({ drift }: { drift: DriftReport }) {
  return (
    <Box flexDirection="column" marginTop={SPACING.xs}>
      {drift.missingPackages.length > 0 && (
        <Box>
          <Text color={COLORS.error}>● </Text>
          <Text color={COLORS.error}>
            {t('brewfile_drift_missing', { count: drift.missingPackages.length })}
          </Text>
          <Text color={COLORS.textSecondary}>
            {': ' + drift.missingPackages.slice(0, 3).join(', ')}
            {drift.missingPackages.length > 3 ? '...' : ''}
          </Text>
        </Box>
      )}
      {drift.extraPackages.length > 0 && (
        <Box>
          <Text color={COLORS.warning}>● </Text>
          <Text color={COLORS.warning}>
            {t('brewfile_drift_extra', { count: drift.extraPackages.length })}
          </Text>
        </Box>
      )}
      {drift.wrongVersions.length > 0 && (
        <Box>
          <Text color={COLORS.info}>● </Text>
          <Text color={COLORS.info}>
            {t('brewfile_drift_wrong', { count: drift.wrongVersions.length })}
          </Text>
        </Box>
      )}
      {drift.missingPackages.length === 0 &&
        drift.extraPackages.length === 0 &&
        drift.wrongVersions.length === 0 && (
          <ResultBanner status="success" message={t('brewfile_in_sync')} />
        )}
    </Box>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function BrewfileView() {
  const isPro = useLicenseStore((s) => s.isPro);
  const { schema, drift, loading, driftLoading, error, load, createFromCurrent } = useBrewfileStore();

  const [phase, setPhase] = useState<Phase>('overview');
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [streamRunning, setStreamRunning] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const generatorRef = useRef<AsyncGenerator<string> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      void generatorRef.current?.return(undefined);
    };
  }, []);

  const startReconcile = useCallback(async () => {
    if (!schema) return;
    setPhase('reconciling');
    setStreamLines([]);
    setStreamError(null);
    setStreamRunning(true);

    const gen = reconcile(schema, isPro());
    generatorRef.current = gen;

    try {
      for await (const line of gen) {
        if (!mountedRef.current) break;
        setStreamLines((prev) => [...prev.slice(-99), line]);
      }
      if (mountedRef.current) {
        setResultMessage(t('brewfile_reconcile_success'));
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setStreamError(msg);
        setResultMessage(t('brewfile_reconcile_error', { error: msg }));
      }
    } finally {
      generatorRef.current = null;
      if (mountedRef.current) {
        setStreamRunning(false);
        setPhase('result');
      }
    }
  }, [schema, isPro]);

  useViewInput((input, key) => {
    if (phase === 'reconciling') return;
    if (phase === 'confirming-reconcile') return; // ConfirmDialog handles input

    if (phase === 'result') {
      if (key.escape || input === 'r') {
        setPhase('overview');
        void load();
      }
      return;
    }

    if (phase === 'creating') return; // TextInput handles input

    // phase === 'overview'
    if (input === 'n' || input === '1') {
      setPhase('creating');
      return;
    }
    if (input === 'r' || input === '2') {
      void load();
      return;
    }
    if (input === 'c' || input === '3') {
      const needsReconcile =
        drift && (
          drift.missingPackages.length > 0 ||
          drift.wrongVersions.length > 0
        );
      if (needsReconcile) {
        setPhase('confirming-reconcile');
      }
      return;
    }
    if (key.escape) {
      // back handled by global navigation
    }
  });

  if (loading) return <Loading message={t('loading_default')} />;
  if (error) return <ErrorMessage message={error} />;

  // ── Phase: confirming-reconcile ──
  if (phase === 'confirming-reconcile' && drift) {
    return (
      <ConfirmDialog
        message={t('confirm_brewfile_reconcile', {
          missing: String(drift.missingPackages.length),
          wrongVer: String(drift.wrongVersions.length),
        })}
        onConfirm={() => { void startReconcile(); }}
        onCancel={() => { setPhase('overview'); }}
      />
    );
  }

  // ── Phase: creating ──
  if (phase === 'creating') {
    return (
      <Box flexDirection="column" marginTop={SPACING.xs}>
        <SectionHeader emoji="📦" title={t('brewfile_title')} gradient={GRADIENTS.ocean} />
        <Box marginTop={SPACING.xs}>
          <Text color={COLORS.textSecondary}>{t('brewfile_create_name')} </Text>
          <TextInput
            defaultValue="My Environment"
            onSubmit={(value) => {
              const name = value.trim() || 'My Environment';
              setPhase('overview');
              void createFromCurrent(name).then(() => {
                // drift will auto-refresh via store
              });
            }}
          />
        </Box>
      </Box>
    );
  }

  // ── Phase: reconciling ──
  if (phase === 'reconciling') {
    return (
      <Box flexDirection="column">
        <ProgressLog
          lines={streamLines}
          isRunning={streamRunning}
          title={t('brewfile_reconciling')}
        />
      </Box>
    );
  }

  // ── Phase: result ──
  if (phase === 'result') {
    return (
      <Box flexDirection="column" marginTop={SPACING.xs}>
        <ResultBanner
          status={streamError ? 'error' : 'success'}
          message={resultMessage}
        />
        <Box marginTop={SPACING.xs}>
          <Text color={COLORS.textSecondary}>r:{t('hint_refresh')}  esc:{t('hint_back')}</Text>
        </Box>
      </Box>
    );
  }

  // ── Phase: overview ──
  return (
    <Box flexDirection="column">
      <SectionHeader emoji="📦" title={t('brewfile_title')} gradient={GRADIENTS.ocean} />

      {schema === null ? (
        <Box marginTop={SPACING.xs} flexDirection="column">
          <ResultBanner status="info" message={t('brewfile_no_brewfile')} />
          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.textSecondary}>n:{t('hint_new')}</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={SPACING.xs}>
          {/* Brewfile metadata */}
          <Box gap={SPACING.sm}>
            <Text color={COLORS.text} bold>{schema.meta.name}</Text>
            {schema.meta.description && (
              <Text color={COLORS.textSecondary}>{schema.meta.description}</Text>
            )}
            {schema.strictMode && (
              <Text color={COLORS.warning}>[{t('brewfile_strict_mode')}]</Text>
            )}
          </Box>

          {/* Package counts */}
          <Box gap={SPACING.md} marginTop={SPACING.xs}>
            <Text color={COLORS.sky}>
              {t('brewfile_formulae_count', { count: schema.formulae.length })}
            </Text>
            <Text color={COLORS.teal}>
              {t('brewfile_casks_count', { count: schema.casks.length })}
            </Text>
          </Box>

          {/* Drift score */}
          {driftLoading && (
            <Box marginTop={SPACING.xs}>
              <Text color={COLORS.muted}>{t('brewfile_computing_drift')}</Text>
            </Box>
          )}
          {drift && !driftLoading && (
            <Box flexDirection="column" marginTop={SPACING.xs}>
              <DriftScore score={drift.score} />
              <DriftSummary drift={drift} />
            </Box>
          )}

          {/* Keyboard hints */}
          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.textSecondary}>
              r:{t('hint_refresh')}
              {drift && (drift.missingPackages.length > 0 || drift.wrongVersions.length > 0)
                ? `  c:${t('hint_reconcile')}`
                : ''}
              {'  '}n:{t('hint_new')}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
