import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useRollbackStore } from '../stores/rollback-store.js';
import { useLicenseStore } from '../stores/license-store.js';
import { executeRollbackPlan } from '../lib/rollback/rollback-engine.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SectionHeader } from '../components/common/section-header.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t, tp } from '../i18n/index.js';
import type { RollbackAction, RollbackPlan } from '../lib/rollback/types.js';
import { SPACING } from '../utils/spacing.js';

type Phase = 'list' | 'plan' | 'confirm' | 'executing' | 'result';

function strategyLabel(action: RollbackAction): string {
  switch (action.strategy) {
    case 'versioned-formula': return t('rollback_strategy_versioned');
    case 'bottle-cache':      return t('rollback_strategy_bottle');
    case 'pin-only':          return t('rollback_strategy_pin');
    case 'unavailable':       return t('rollback_strategy_unavailable');
  }
}

function actionColor(action: RollbackAction): string {
  if (action.strategy === 'unavailable') return COLORS.muted;
  if (action.action === 'remove')        return COLORS.muted;
  if (action.action === 'downgrade')     return COLORS.warning;
  if (action.action === 'install')       return COLORS.success;
  return COLORS.info;
}

function actionPrefix(action: RollbackAction): string {
  if (action.strategy === 'unavailable' || action.action === 'remove') return '⊗';
  if (action.strategy === 'pin-only') return '📌';
  if (action.action === 'downgrade') return '⬇';
  return '⬆';
}

function PlanView({ plan }: { plan: RollbackPlan }) {
  const executableCount = plan.actions.filter((a) => a.strategy !== 'unavailable' && a.action !== 'remove').length;

  return (
    <Box flexDirection="column" marginTop={SPACING.xs}>
      <Box marginBottom={SPACING.xs}>
        <Text color={COLORS.text} bold>{plan.snapshotLabel} </Text>
        <Text color={COLORS.textSecondary}>{plan.snapshotDate}</Text>
      </Box>

      {plan.actions.length === 0 && (
        <ResultBanner status="success" message={t('rollback_diff_empty')} />
      )}

      {plan.actions.map((a) => (
        <Box key={a.packageName + a.action}>
          <Text color={actionColor(a)}>{actionPrefix(a)} </Text>
          <Text color={actionColor(a)} bold>{a.packageName}</Text>
          {a.fromVersion !== '' && a.toVersion !== '' && (
            <Text color={COLORS.textSecondary}>{' '}{a.fromVersion} → {a.toVersion}</Text>
          )}
          {a.fromVersion === '' && a.toVersion !== '' && (
            <Text color={COLORS.textSecondary}> install {a.toVersion}</Text>
          )}
          {a.fromVersion !== '' && a.toVersion === '' && (
            <Text color={COLORS.textSecondary}> remove</Text>
          )}
          <Text color={COLORS.muted} dimColor>  [{strategyLabel(a)}]</Text>
        </Box>
      ))}

      {plan.warnings.map((w) => (
        <Box key={w} marginTop={SPACING.xs}>
          <Text color={COLORS.warning}>⚠ {w}</Text>
        </Box>
      ))}

      <Box marginTop={SPACING.xs}>
        {plan.canExecute ? (
          <Text color={COLORS.textSecondary}>
            enter:{t('rollback_confirm', { count: String(executableCount) })}  esc:{t('hint_back')}
          </Text>
        ) : (
          <Text color={COLORS.muted}>{t('rollback_strategy_unavailable')}  esc:{t('hint_back')}</Text>
        )}
      </Box>
    </Box>
  );
}

export function RollbackView() {
  const isPro = useLicenseStore((s) => s.isPro);
  const { snapshots, loading, error, plan, planLoading, planError, fetchSnapshots, selectSnapshot, clearPlan } = useRollbackStore();

  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>('list');
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [streamRunning, setStreamRunning] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const generatorRef = useRef<AsyncGenerator<string> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void generatorRef.current?.return(undefined);
    };
  }, []);

  useEffect(() => { void fetchSnapshots(isPro()); }, []);

  const runRollback = useCallback(async (p: RollbackPlan) => {
    setPhase('executing');
    setStreamLines([]);
    setStreamError(null);
    setStreamRunning(true);

    const gen = executeRollbackPlan(p, isPro());
    generatorRef.current = gen;

    try {
      for await (const line of gen) {
        if (!mountedRef.current) break;
        setStreamLines((prev) => [...prev.slice(-99), line]);
      }
    } catch (err) {
      if (mountedRef.current) {
        setStreamError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      generatorRef.current = null;
      if (mountedRef.current) {
        setStreamRunning(false);
        setPhase('result');
      }
    }
  }, [isPro]);

  useViewInput((input, key) => {
    if (phase === 'executing') return;

    if (phase === 'result') {
      if (key.escape || input === 'r') {
        setPhase('list');
        clearPlan();
        void fetchSnapshots(isPro());
      }
      return;
    }

    if (phase === 'confirm') return;

    if (phase === 'plan') {
      if (key.escape) { clearPlan(); setPhase('list'); return; }
      if (key.return && plan?.canExecute) { setPhase('confirm'); }
      return;
    }

    // phase === 'list'
    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, Math.max(0, snapshots.length - 1)));
    } else if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (key.return && snapshots[cursor]) {
      void selectSnapshot(snapshots[cursor]!, isPro());
      setPhase('plan');
    } else if (input === 'r' || input === '1') {
      void fetchSnapshots(isPro());
    }
  });

  if (loading) return <Loading message={t('rollback_select_snapshot')} />;
  if (error) return <ErrorMessage message={error} />;

  if (phase === 'executing') {
    return (
      <Box flexDirection="column">
        <ProgressLog lines={streamLines} isRunning={streamRunning} title={t('rollback_executing')} />
      </Box>
    );
  }

  if (phase === 'result') {
    return (
      <Box flexDirection="column" marginTop={SPACING.xs}>
        <ResultBanner
          status={streamError ? 'error' : 'success'}
          message={streamError ? t('rollback_error', { error: streamError }) : t('rollback_success')}
        />
        <Box marginTop={SPACING.xs}>
          <Text color={COLORS.textSecondary}>r:{t('hint_refresh')}  esc:{t('hint_back')}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <SectionHeader emoji="⏪" title={t('rollback_title')} gradient={GRADIENTS.gold} />

      {snapshots.length === 0 && (
        <Box marginTop={SPACING.xs}>
          <ResultBanner status="info" message={t('rollback_no_snapshots')} />
        </Box>
      )}

      {phase === 'list' && snapshots.length > 0 && (
        <Box flexDirection="column" marginTop={SPACING.xs}>
          <Text color={COLORS.textSecondary} dimColor>{t('rollback_select_snapshot')}</Text>
          <Box flexDirection="column" marginTop={SPACING.xs}>
            {snapshots.map((s, i) => (
              <SelectableRow key={s.capturedAt} isCurrent={i === cursor}>
                <Text bold={i === cursor} color={i === cursor ? COLORS.text : COLORS.muted}>
                  {s.label ?? t('rollback_snapshot_auto')}
                </Text>
                <Text color={COLORS.textSecondary}>
                  {' — '}{new Date(s.capturedAt).toLocaleString()}
                </Text>
                <Text color={COLORS.muted} dimColor>
                  {' '}({tp('packages', s.formulae.length + s.casks.length)})
                </Text>
              </SelectableRow>
            ))}
          </Box>
        </Box>
      )}

      {phase === 'plan' && (
        <Box flexDirection="column">
          {planLoading && <Loading message={t('rollback_capturing')} />}
          {planError && <ErrorMessage message={planError} />}
          {plan && !planLoading && <PlanView plan={plan} />}
        </Box>
      )}

      {phase === 'confirm' && plan && (
        <Box marginTop={SPACING.xs}>
          <ConfirmDialog
            message={t('rollback_confirm', {
              count: String(plan.actions.filter((a) => a.strategy !== 'unavailable' && a.action !== 'remove').length),
            })}
            onConfirm={() => void runRollback(plan)}
            onCancel={() => setPhase('plan')}
          />
        </Box>
      )}
    </Box>
  );
}
