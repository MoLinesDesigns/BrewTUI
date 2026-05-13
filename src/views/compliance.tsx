import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { TextInput } from '@inkjs/ui';
import { useComplianceStore } from '../stores/compliance-store.js';
import { useLicenseStore } from '../stores/license-store.js';
import { remediateViolations } from '../lib/compliance/compliance-remediator.js';
import { exportReport } from '../lib/compliance/policy-io.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SectionHeader } from '../components/common/section-header.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { Loading } from '../components/common/loading.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t } from '../i18n/index.js';
import { DATA_DIR } from '../lib/data-dir.js';
import { join } from 'node:path';
import type { ComplianceReport, ComplianceViolation } from '../lib/compliance/types.js';
import { SPACING } from '../utils/spacing.js';

type Phase = 'overview' | 'importing' | 'confirming-remediate' | 'remediating' | 'result';

function ComplianceScore({ report }: { report: ComplianceReport }) {
  const color =
    report.score >= 80 ? COLORS.success : report.score >= 50 ? COLORS.warning : COLORS.error;
  const bars = Math.round(report.score / 10);

  return (
    <Box flexDirection="column" marginBottom={SPACING.xs}>
      <Box>
        <Text color={color}>{'▓'.repeat(bars)}{'░'.repeat(10 - bars)}</Text>
        <Text color={color} bold> {report.score}%</Text>
        <Text color={COLORS.textSecondary}> {t('compliance_score', { score: String(report.score) })}</Text>
      </Box>
      <Text color={COLORS.muted} dimColor>
        {t('compliance_policy_name', { name: report.policyName })} · {t('compliance_machine', { name: report.machineName })}
      </Text>
    </Box>
  );
}

function ViolationItem({ violation }: { violation: ComplianceViolation }) {
  const color = violation.severity === 'error' ? COLORS.error : COLORS.warning;
  const prefix = violation.severity === 'error' ? '✗' : '⚠';

  return (
    <Box marginBottom={SPACING.none}>
      <Text color={color}>{prefix} </Text>
      <Text color={color}>{violation.detail}</Text>
    </Box>
  );
}

function ViolationList({ violations }: { violations: ComplianceViolation[] }) {
  const errors = violations.filter((v) => v.severity === 'error');
  const warnings = violations.filter((v) => v.severity === 'warning');

  return (
    <Box flexDirection="column" marginTop={SPACING.xs}>
      {errors.length > 0 && (
        <Box flexDirection="column" marginBottom={SPACING.xs}>
          <Text color={COLORS.error} bold>{t('compliance_violations', { count: String(errors.length) })} (errors)</Text>
          {errors.map((v) => (
            <ViolationItem key={`${v.type}-${v.packageName}`} violation={v} />
          ))}
        </Box>
      )}
      {warnings.length > 0 && (
        <Box flexDirection="column">
          <Text color={COLORS.warning} bold>{t('compliance_violations', { count: String(warnings.length) })} (warnings)</Text>
          {warnings.map((v) => (
            <ViolationItem key={`${v.type}-${v.packageName}`} violation={v} />
          ))}
        </Box>
      )}
    </Box>
  );
}

export function ComplianceView() {
  const isPro = useLicenseStore((s) => s.isPro);
  const { policy, report, loading, error, importPolicy, runCheck } =
    useComplianceStore();

  const [phase, setPhase] = useState<Phase>('overview');
  const [resultMessage, setResultMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [streamRunning, setStreamRunning] = useState(false);
  const generatorRef = useRef<AsyncGenerator<string> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void generatorRef.current?.return(undefined);
    };
  }, []);

  const handleImportSubmit = useCallback(
    async (filePath: string) => {
      if (!filePath.trim()) { setPhase('overview'); return; }
      await importPolicy(filePath.trim(), isPro());
      // importPolicy actualiza el store; runCheck si no hubo error
      const state = useComplianceStore.getState();
      if (!state.error && state.policy) {
        await runCheck(isPro());
      }
      setPhase('overview');
    },
    [isPro, importPolicy, runCheck],
  );

  const handleRecheck = useCallback(() => {
    void runCheck(isPro());
  }, [isPro, runCheck]);

  const handleExport = useCallback(async () => {
    if (!report) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = join(DATA_DIR, `compliance-report-${timestamp}.json`);
    try {
      await exportReport(report, outputPath);
      setResultMessage({ ok: true, text: t('compliance_export_done', { path: outputPath }) });
      setPhase('result');
    } catch (err) {
      setResultMessage({
        ok: false,
        text: t('compliance_remediate_error', { error: err instanceof Error ? err.message : String(err) }),
      });
      setPhase('result');
    }
  }, [report]);

  const handleRemediate = useCallback(async () => {
    if (!report) return;
    const actionable = report.violations.filter(
      (v) => v.type === 'missing' || v.type === 'wrong-version',
    );
    if (actionable.length === 0) return;

    setPhase('remediating');
    setStreamLines([]);
    setStreamRunning(true);

    const gen = remediateViolations(actionable, isPro());
    generatorRef.current = gen;

    try {
      for await (const line of gen) {
        if (!mountedRef.current) break;
        setStreamLines((prev) => [...prev.slice(-99), line]);
      }
      if (mountedRef.current) {
        setResultMessage({ ok: true, text: t('compliance_remediate_success') });
        // Re-check after remediation
        await runCheck(isPro());
      }
    } catch (err) {
      if (mountedRef.current) {
        setResultMessage({
          ok: false,
          text: t('compliance_remediate_error', { error: err instanceof Error ? err.message : String(err) }),
        });
      }
    } finally {
      generatorRef.current = null;
      if (mountedRef.current) {
        setStreamRunning(false);
        setPhase('result');
      }
    }
  }, [report, isPro, runCheck]);

  useViewInput((input, key) => {
    if (phase === 'remediating' || phase === 'importing') return;
    if (phase === 'confirming-remediate') return;

    if (phase === 'result') {
      if (key.escape || input === 'r') {
        setPhase('overview');
        setResultMessage(null);
      }
      return;
    }

    // phase === 'overview'
    if (input === 'i' || input === '2') {
      setPhase('importing');
      return;
    }
    if ((input === 'r' || input === '1') && policy) {
      handleRecheck();
      return;
    }
    if ((input === 'e' || input === '3') && report) {
      void handleExport();
      return;
    }
    if ((input === 'c' || input === '4') && report) {
      const actionable = report.violations.filter(
        (v) => v.type === 'missing' || v.type === 'wrong-version',
      );
      if (actionable.length > 0) {
        setPhase('confirming-remediate');
      }
      return;
    }
  });

  if (phase === 'confirming-remediate' && report) {
    const actionable = report.violations.filter(
      (v) => v.type === 'missing' || v.type === 'wrong-version',
    );
    return (
      <ConfirmDialog
        message={t('confirm_compliance_remediate', { count: String(actionable.length) })}
        onConfirm={() => { void handleRemediate(); }}
        onCancel={() => { setPhase('overview'); }}
      />
    );
  }

  if (phase === 'remediating' || (loading && phase !== 'importing')) {
    if (phase === 'remediating') {
      return (
        <Box flexDirection="column">
          <SectionHeader emoji="🔍" title={t('compliance_title')} gradient={GRADIENTS.gold} />
          <Box marginTop={SPACING.xs}>
            <ProgressLog lines={streamLines} isRunning={streamRunning} title={t('compliance_remediating')} />
          </Box>
        </Box>
      );
    }
    return <Loading message={t('compliance_title')} />;
  }

  if (phase === 'result' && resultMessage) {
    return (
      <Box flexDirection="column" marginTop={SPACING.xs}>
        <SectionHeader emoji="🔍" title={t('compliance_title')} gradient={GRADIENTS.gold} />
        <Box marginTop={SPACING.xs}>
          <ResultBanner
            status={resultMessage.ok ? 'success' : 'error'}
            message={resultMessage.text}
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
      <SectionHeader emoji="🔍" title={t('compliance_title')} gradient={GRADIENTS.gold} />

      {error && (
        <Box marginTop={SPACING.xs}>
          <ResultBanner status="error" message={t('compliance_import_error', { error })} />
        </Box>
      )}

      {phase === 'importing' && (
        <Box marginTop={SPACING.xs} flexDirection="column">
          <Text color={COLORS.textSecondary}>{t('compliance_import_prompt')}</Text>
          <Box marginTop={SPACING.xs}>
            <TextInput
              defaultValue=""
              onSubmit={(val) => { void handleImportSubmit(val); }}
            />
          </Box>
          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.muted} dimColor>esc:{t('hint_back')}</Text>
          </Box>
        </Box>
      )}

      {phase === 'overview' && (
        <Box flexDirection="column" marginTop={SPACING.xs}>
          {!policy ? (
            <Box flexDirection="column">
              <Text color={COLORS.textSecondary}>{t('compliance_no_policy')}</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color={COLORS.textSecondary} bold>
                {t('compliance_policy_by', { maintainer: policy.meta.maintainer })}
              </Text>

              {report ? (
                <Box flexDirection="column" marginTop={SPACING.xs}>
                  <ComplianceScore report={report} />
                  {report.compliant ? (
                    <ResultBanner status="success" message={t('compliance_ok')} />
                  ) : (
                    <ViolationList violations={report.violations} />
                  )}
                </Box>
              ) : (
                <Box marginTop={SPACING.xs}>
                  <Text color={COLORS.muted} dimColor>{t('compliance_press_r_hint')}</Text>
                </Box>
              )}
            </Box>
          )}

          <Box marginTop={SPACING.sm} flexWrap="wrap">
            <Text color={COLORS.textSecondary}>
              i:{t('hint_import')}
              {policy && <Text>  r:{t('hint_scan')}</Text>}
              {report && <Text>  e:{t('hint_export')}</Text>}
              {report && report.violations.some((v) => v.type === 'missing' || v.type === 'wrong-version') && (
                <Text>  c:{t('hint_clean')}</Text>
              )}
              {'  q:'}{t('hint_quit')}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
