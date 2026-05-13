import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useSecurityStore } from '../stores/security-store.js';
import { useNavigationStore } from '../stores/navigation-store.js';
import { useBrewStream } from '../hooks/use-brew-stream.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { StatCard } from '../components/common/stat-card.js';
import { StatusBadge } from '../components/common/status-badge.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SectionHeader } from '../components/common/section-header.js';
import { COLORS } from '../utils/colors.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t, tp } from '../i18n/index.js';
import { formatRelativeTime } from '../utils/format.js';
import type { Severity } from '../lib/security/types.js';
import { SPACING } from '../utils/spacing.js';

const SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: COLORS.error,
  HIGH: COLORS.error,
  MEDIUM: COLORS.warning,
  LOW: COLORS.textSecondary,
  UNKNOWN: COLORS.textSecondary,
};

const SEVERITY_BADGE: Record<Severity, 'error' | 'warning' | 'muted'> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'muted',
  UNKNOWN: 'muted',
};

// SCR-017: Detect network-related errors
function isNetworkError(msg: string): boolean {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|abort/i.test(msg);
}

export function SecurityAuditView() {
  const { summary, loading, error, scan, cachedAt } = useSecurityStore();
  const navigate = useNavigationStore((s) => s.navigate);
  const [cursor, setCursor] = useState(0);
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [confirmUpgrade, setConfirmUpgrade] = useState<string | null>(null);
  const stream = useBrewStream();

  useEffect(() => { scan(); }, []);

  const results = summary?.results ?? [];

  useViewInput((input, key) => {
    if (confirmUpgrade || stream.isRunning) return;

    // ARQ-005: Manual refresh forces cache invalidation
    if (input === 'r' || input === '1') { void scan(true); return; }
    // Navigate to rollback view (capital R to avoid conflict with rescan)
    if (input === 'R') { navigate('rollback'); return; }
    if ((input === 'u' || input === '2') && results[cursor]) {
      setConfirmUpgrade(results[cursor].packageName);
      return;
    }

    if (input === 'j' || key.downArrow) setCursor((c) => Math.min(c + 1, Math.max(0, results.length - 1)));
    else if (input === 'k' || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
    else if (key.return && results[cursor]) {
      setExpandedPkg(expandedPkg === results[cursor].packageName ? null : results[cursor].packageName);
    }
  });

  if (loading) return <Loading message={t('loading_security')} />;

  // SCR-017: Show user-friendly message for network errors
  if (error) {
    const displayError = isNetworkError(error) ? t('security_networkError') : error;
    return <ErrorMessage message={displayError} />;
  }

  // ARQ-005: Show cache indicator
  const cacheAge = cachedAt ? formatRelativeTime(cachedAt / 1000) : null;

  return (
    <Box flexDirection="column">
      <SectionHeader emoji={'\u{1F6E1}\uFE0F'} title={t('security_title')} gradient={GRADIENTS.ocean} />

      {summary && (
        <Box gap={SPACING.xs} marginY={SPACING.xs}>
          <StatCard label={t('security_scanned')} value={summary.totalPackages} color={COLORS.info} />
          <StatCard
            label={t('security_vulnerable')}
            value={summary.vulnerablePackages}
            color={summary.vulnerablePackages > 0 ? COLORS.error : COLORS.success}
          />
          {summary.criticalCount > 0 && <StatCard label={t('security_critical')} value={summary.criticalCount} color={COLORS.error} />}
          {summary.highCount > 0 && <StatCard label={t('security_high')} value={summary.highCount} color={COLORS.error} />}
          {summary.mediumCount > 0 && <StatCard label={t('security_medium')} value={summary.mediumCount} color={COLORS.warning} />}
        </Box>
      )}

      {/* ARQ-005: Cache indicator */}
      {cacheAge && (
        <Text color={COLORS.muted}>{t('security_cachedResults', { time: cacheAge })}</Text>
      )}

      {/* UI-014: be honest about coverage \u2014 OSV's Bitnami dataset does not
          map every Homebrew formula, so "0 CVEs" is not the same as "safe". */}
      {summary && (
        <Box marginTop={SPACING.xs}>
          <Text color={COLORS.textSecondary} italic>{t('security_coverage_warning')}</Text>
        </Box>
      )}

      {results.length === 0 && summary && (
        <Box marginTop={SPACING.xs}>
          <ResultBanner status="success" message={`\u2714 ${t('security_noVulns')}`} />
        </Box>
      )}

      {confirmUpgrade && (
        <Box marginY={SPACING.xs}>
          <ConfirmDialog
            message={t('security_confirmUpgrade', { name: confirmUpgrade })}
            onConfirm={async () => {
              const name = confirmUpgrade;
              setConfirmUpgrade(null);
              await stream.run(['upgrade', name]);
              void scan(true);
            }}
            onCancel={() => setConfirmUpgrade(null)}
          />
        </Box>
      )}

      {(stream.isRunning || stream.lines.length > 0) && (
        <Box marginY={SPACING.xs}>
          <ProgressLog lines={stream.lines} isRunning={stream.isRunning} title={t('hint_upgrade')} />
        </Box>
      )}

      {results.length > 0 && (
        <Box flexDirection="column" marginTop={SPACING.xs}>
          {results.map((pkg, i) => {
            const isCurrent = i === cursor;
            const isExpanded = expandedPkg === pkg.packageName;

            return (
              <Box key={pkg.packageName} flexDirection="column">
                <SelectableRow isCurrent={isCurrent}>
                  <StatusBadge label={pkg.maxSeverity} variant={SEVERITY_BADGE[pkg.maxSeverity]} />
                  <Text bold={isCurrent} inverse={isCurrent} color={isCurrent ? COLORS.text : COLORS.muted}>
                    {pkg.packageName}
                  </Text>
                  <Text color={COLORS.muted}>{pkg.installedVersion}</Text>
                  <Text color={COLORS.muted}>{tp('plural_vulns', pkg.vulnerabilities.length)}</Text>
                  {pkg.vulnerabilities.some((v) => v.fixedVersion) && (
                    <Text color={COLORS.textSecondary}>[R:{t('hint_rollback')}]</Text>
                  )}
                  <Text color={COLORS.muted}>{isExpanded ? '\u25BC' : '\u25B6'}</Text>
                </SelectableRow>

                {isExpanded && (
                  <Box flexDirection="column" paddingLeft={SPACING.lg} marginBottom={SPACING.xs}>
                    {pkg.vulnerabilities.map((vuln) => (
                      <Box key={vuln.id} flexDirection="column" marginBottom={SPACING.xs}>
                        <Box gap={SPACING.xs}>
                          <Text color={SEVERITY_COLORS[vuln.severity]} bold>{vuln.id}</Text>
                          <Text color={COLORS.muted}>[{vuln.severity}]</Text>
                        </Box>
                        <Text color={COLORS.muted} wrap="wrap">{vuln.summary}</Text>
                        {vuln.fixedVersion && (
                          <Text color={COLORS.success}>{t('security_fixedIn', { version: vuln.fixedVersion })}</Text>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}

          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.text} bold>
              {cursor + 1}/{results.length}
            </Text>
          </Box>
          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.textSecondary}>{t('security_rollback_hint')}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
