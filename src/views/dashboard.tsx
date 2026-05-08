import React, { useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useBrewStore } from '../stores/brew-store.js';
import { useSecurityStore } from '../stores/security-store.js';
import { useBrewfileStore } from '../stores/brewfile-store.js';
import { useSyncStore } from '../stores/sync-store.js';
import { useComplianceStore } from '../stores/compliance-store.js';
import { useLicenseStore } from '../stores/license-store.js';
import { StatCard } from '../components/common/stat-card.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { StatusBadge } from '../components/common/status-badge.js';
import { SectionHeader } from '../components/common/section-header.js';
import { VersionArrow } from '../components/common/version-arrow.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t } from '../i18n/index.js';
import { formatRelativeTime } from '../utils/format.js';
import { SPACING } from '../utils/spacing.js';

function ProStatusPanel() {
  const security = useSecurityStore((s) => s.summary);
  const drift = useBrewfileStore((s) => s.drift);
  const syncConfig = useSyncStore((s) => s.config);
  const complianceReport = useComplianceStore((s) => s.report);

  const cveCount = security ? security.vulnerablePackages : null;
  const criticalCount = security ? security.criticalCount : null;

  const driftScore = drift ? drift.score : null;

  const lastSync = syncConfig?.lastSync ?? null;
  const syncAgo = lastSync ? formatRelativeTime(new Date(lastSync).getTime() / 1000) : null;

  const violationCount = complianceReport ? complianceReport.violations.length : null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.purple} paddingX={SPACING.sm} paddingY={SPACING.none} marginTop={SPACING.xs}>
      <Text bold color={COLORS.purple}>{t('dashboard_pro_status')}</Text>
      <Box gap={SPACING.xs}>
        <Text color={COLORS.muted}>{t('dashboard_security')}</Text>
        {cveCount === null ? (
          <Text color={COLORS.muted}>—</Text>
        ) : cveCount === 0 ? (
          <Text color={COLORS.success}>{t('dashboard_no_cves')}</Text>
        ) : (
          <Text color={COLORS.error}>
            {t('dashboard_cves', { count: String(cveCount) })}
            {criticalCount && criticalCount > 0 ? ` (${criticalCount} critical)` : ''}
          </Text>
        )}
      </Box>
      <Box gap={SPACING.xs}>
        <Text color={COLORS.muted}>{t('dashboard_brewfile')}</Text>
        {driftScore === null ? (
          <Text color={COLORS.muted}>—</Text>
        ) : (
          <Text color={driftScore >= 80 ? COLORS.success : COLORS.warning}>{driftScore}%</Text>
        )}
      </Box>
      <Box gap={SPACING.xs}>
        <Text color={COLORS.muted}>{t('dashboard_sync')}</Text>
        {syncAgo === null ? (
          <Text color={COLORS.muted}>{t('dashboard_sync_never')}</Text>
        ) : (
          <Text color={COLORS.info}>{t('dashboard_sync_ago', { time: syncAgo })}</Text>
        )}
      </Box>
      <Box gap={SPACING.xs}>
        <Text color={COLORS.muted}>{t('dashboard_compliance')}</Text>
        {violationCount === null ? (
          <Text color={COLORS.muted}>—</Text>
        ) : violationCount === 0 ? (
          <Text color={COLORS.success}>{t('dashboard_compliance_ok')}</Text>
        ) : (
          <Text color={COLORS.warning}>{t('dashboard_compliance_violations', { count: String(violationCount) })}</Text>
        )}
      </Box>
    </Box>
  );
}

export function DashboardView() {
  // PERF-004: granular selectors so a `loading` map mutation for an unrelated
  // key does not re-render the entire dashboard.
  const formulae = useBrewStore((s) => s.formulae);
  const casks = useBrewStore((s) => s.casks);
  const outdated = useBrewStore((s) => s.outdated);
  const services = useBrewStore((s) => s.services);
  const config = useBrewStore((s) => s.config);
  const loading = useBrewStore((s) => s.loading);
  const errors = useBrewStore((s) => s.errors);
  const lastFetchedAt = useBrewStore((s) => s.lastFetchedAt);
  const fetchAll = useBrewStore((s) => s.fetchAll);
  const isPro = useLicenseStore((s) => s.isPro);
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  useEffect(() => { fetchAll(); }, []);

  // UX-008: `r` triggers a refetch from any state — error or not — so the
  // user can refresh the dashboard without leaving the view.
  useInput((input) => {
    if (input === 'r' || input === 'R') {
      void fetchAll();
    }
  });

  const errorServiceList = useMemo(
    () => services.filter((s) => s.status === 'error'),
    [services]
  );
  const runningServices = useMemo(
    () => services.filter((s) => s.status === 'started').length,
    [services]
  );
  const errorServices = errorServiceList.length;
  const partialErrors = [
    errors.outdated ? { label: t('dashboard_outdated'), message: errors.outdated } : null,
    errors.services ? { label: t('dashboard_services'), message: errors.services } : null,
    errors.config ? { label: t('dashboard_systemInfo'), message: errors.config } : null,
  ].filter((item): item is { label: string; message: string } => item !== null);
  const outdatedValue = loading.outdated
    ? '...'
    : errors.outdated
      ? t('dashboard_statError')
      : outdated.formulae.length + outdated.casks.length;
  const servicesValue = loading.services
    ? '...'
    : errors.services
      ? t('dashboard_statError')
      : `${runningServices}/${services.length}`;

  // ARQ-004: Last updated timestamp
  const lastUpdated = lastFetchedAt.installed
    ? formatRelativeTime(lastFetchedAt.installed / 1000)
    : null;

  if (loading.installed) return <Loading message={t('loading_fetchingBrew')} />;
  if (errors.installed) {
    return (
      <Box flexDirection="column">
        <ErrorMessage message={errors.installed} />
        <Box marginTop={SPACING.xs}>
          <Text color={COLORS.textSecondary}>r:{t('hint_refresh')}</Text>
        </Box>
      </Box>
    );
  }

  // SCR-018: Responsive layout
  const isNarrow = columns < 60;

  return (
    <Box flexDirection="column" gap={SPACING.sm}>
      <SectionHeader emoji={'\u{1F4CA}'} title={t('dashboard_overview')} gradient={GRADIENTS.gold} />

      <Box gap={SPACING.xs} flexWrap="wrap" flexDirection={isNarrow ? 'column' : 'row'}>
        <StatCard label={t('dashboard_formulae')} value={formulae.length} color={COLORS.info} />
        <StatCard label={t('dashboard_casks')} value={casks.length} color={COLORS.purple} />
        <StatCard
          label={t('dashboard_outdated')}
          value={outdatedValue}
          color={typeof outdatedValue === 'number' && outdatedValue > 0 ? COLORS.warning : (errors.outdated ? COLORS.error : COLORS.success)}
        />
        <StatCard
          label={t('dashboard_services')}
          value={servicesValue}
          color={errors.services || errorServices > 0 ? COLORS.error : COLORS.success}
        />
      </Box>

      {/* ARQ-004: Show last updated */}
      {lastUpdated && (
        <Text color={COLORS.muted}>{t('dashboard_lastUpdated', { time: lastUpdated })}</Text>
      )}

      {partialErrors.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor={COLORS.warning} paddingX={SPACING.sm} paddingY={SPACING.none}>
          <Text color={COLORS.warning} bold>{t('dashboard_partialData')}</Text>
          {partialErrors.map((item) => (
            <Text key={item.label} color={COLORS.muted}>
              {item.label}: {item.message}
            </Text>
          ))}
        </Box>
      )}

      {config && !errors.config && (
        <Box flexDirection="column">
          <SectionHeader emoji={'\u2139\uFE0F'} title={t('dashboard_systemInfo')} gradient={[COLORS.text, COLORS.muted]} />
          <Box borderStyle="round" borderColor={COLORS.blue} paddingX={SPACING.sm} paddingY={SPACING.none} flexDirection="column" marginTop={SPACING.xs}>
            <Text><Text color={COLORS.muted}>{t('dashboard_homebrew')}</Text> {config.HOMEBREW_VERSION}</Text>
            <Text><Text color={COLORS.muted}>{t('dashboard_prefix')}</Text>   {config.HOMEBREW_PREFIX}</Text>
            <Text><Text color={COLORS.muted}>{t('dashboard_updated')}</Text>  {config.coreUpdated}</Text>
          </Box>
        </Box>
      )}

      {!errors.outdated && outdated.formulae.length > 0 && (
        <Box flexDirection="column" marginTop={SPACING.xs}>
          <SectionHeader emoji={'\u{1F4E6}'} title={t('dashboard_outdatedPackages')} gradient={GRADIENTS.fire} />
          <Box paddingLeft={SPACING.sm} flexDirection="column">
            {outdated.formulae.slice(0, 10).map((pkg) => (
              <Box key={pkg.name} gap={SPACING.xs}>
                <Text color={COLORS.text}>{pkg.name}</Text>
                <VersionArrow current={pkg.installed_versions[0] ?? ''} latest={pkg.current_version} />
              </Box>
            ))}
            {outdated.formulae.length > 10 && (
              <Text color={COLORS.textSecondary} italic>{t('common_andMore', { count: outdated.formulae.length - 10 })}</Text>
            )}
          </Box>
        </Box>
      )}

      {!errors.services && errorServices > 0 && (
        <Box flexDirection="column" marginTop={SPACING.xs}>
          <SectionHeader emoji={'\u26A0\uFE0F'} title={t('dashboard_serviceErrors')} color={COLORS.error} />
          <Box paddingLeft={SPACING.sm} flexDirection="column">
            {errorServiceList.map((s) => (
              <Box key={s.name} gap={SPACING.xs}>
                <StatusBadge label={t('badge_error')} variant="error" />
                <Text>{s.name}</Text>
                {s.exit_code != null && <Text color={COLORS.muted}>{t('common_exit', { code: s.exit_code })}</Text>}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {isPro() && <ProStatusPanel />}
    </Box>
  );
}
