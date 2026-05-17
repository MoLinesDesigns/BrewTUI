import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useNavigationStore } from '../stores/navigation-store.js';
import { useBrewStream } from '../hooks/use-brew-stream.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { StatusBadge } from '../components/common/status-badge.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { SectionHeader } from '../components/common/section-header.js';
import { GradientText, GRADIENTS } from '../utils/gradient.js';
import { COLORS } from '../utils/colors.js';
import { formatRelativeTime } from '../utils/format.js';
import { t } from '../i18n/index.js';
import type { TranslationKey } from '../i18n/en.js';
import * as api from '../lib/brew-api.js';
import type { Formula } from '../lib/types.js';
import { SPACING } from '../utils/spacing.js';
import { writeLastAction } from '../lib/data-dir.js';
import { useBrewStore } from '../stores/brew-store.js';
import { logger } from '../utils/logger.js';

const ACTION_PROGRESS_KEYS: Record<string, TranslationKey> = {
  install: 'pkgInfo_installing',
  uninstall: 'pkgInfo_uninstalling',
  upgrade: 'pkgInfo_upgrading',
};

const ACTION_CONFIRM_KEYS: Record<string, TranslationKey> = {
  install: 'pkgInfo_confirmInstall',
  uninstall: 'pkgInfo_confirmUninstall',
  upgrade: 'pkgInfo_confirmUpgrade',
};

export function PackageInfoView() {
  const packageName = useNavigationStore((s) => s.selectedPackage);
  const packageType = useNavigationStore((s) => s.selectedPackageType);
  const [formula, setFormula] = useState<Formula | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const activeActionRef = useRef<string>('install');
  const mountedRef = useRef(true);
  const hasRefreshed = useRef(false);
  const stream = useBrewStream();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!packageName) return;
    setLoading(true);

    // SCR-008: Try cask-specific info if we know it's a cask
    const fetchInfo = async () => {
      if (packageType === 'cask') {
        // Try cask first, fall back to formula
        const caskInfo = await api.getCaskInfo(packageName);
        if (caskInfo && mountedRef.current) {
          setFormula(api.formulaeFromCask(caskInfo));
          setLoading(false);
          return;
        }
      }
      // Default: try formula info
      const f = await api.getFormulaInfo(packageName);
      if (mountedRef.current) { setFormula(f); setLoading(false); }
    };

    fetchInfo().catch((err) => {
      if (mountedRef.current) { setError(err.message); setLoading(false); }
    });
  }, [packageName, packageType]);

  useEffect(() => {
    if (!stream.isRunning && !stream.error && stream.lines.length > 0 && !hasRefreshed.current && packageName) {
      hasRefreshed.current = true;
      const refreshFn = packageType === 'cask'
        ? api.getCaskInfo(packageName).then((c) => c ? { ...c, installed: c.installed ? [{ version: c.installed }] : [] } as unknown as import('../lib/types.js').Formula : null)
        : api.getFormulaInfo(packageName);
      refreshFn
        .then((f) => { if (mountedRef.current) { setFormula(f); } })
        .catch(() => { /* ignore refresh errors */ });

      // BrewBar handoff for upgrade/install/uninstall actions started here.
      // Refetch the outdated list so remainingOutdated is accurate, then write.
      const action = activeActionRef.current;
      if (action === 'upgrade' || action === 'install' || action === 'uninstall') {
        void useBrewStore.getState().fetchOutdated().then(() => {
          const out = useBrewStore.getState().outdated;
          const remaining = out.formulae.length + out.casks.length;
          void writeLastAction({
            timestamp: new Date().toISOString(),
            action,
            packages: [packageName],
            remainingOutdated: remaining,
            source: 'brew-tui',
          }).catch((err) => logger.warn('Failed to write last-action.json', err));
        });
      }
    }
  }, [stream.isRunning, stream.error]);

  useViewInput((input, key) => {
    if (stream.isRunning) {
      if (key.escape) stream.cancel();
      return;
    }
    if (confirmAction) return;

    if (!formula) return;

    const isInstalled = formula.installed.length > 0;
    if ((input === 'i' || input === '1') && !isInstalled) {
      setConfirmAction('install');
    } else if ((input === 'u' || input === '2') && isInstalled) {
      setConfirmAction('uninstall');
    } else if ((input === 'U' || input === '3') && isInstalled && formula.outdated) {
      setConfirmAction('upgrade');
    }
  });

  if (!packageName) {
    return <Text color={COLORS.textSecondary} italic>{t('pkgInfo_noPackage')}</Text>;
  }

  if (loading) return <Loading message={t('loading_package', { name: packageName })} />;
  if (error) return <ErrorMessage message={error} />;
  if (!formula) return <ErrorMessage message={t('pkgInfo_notFound')} />;

  if (stream.isRunning || stream.lines.length > 0) {
    return (
      <Box flexDirection="column">
        <ProgressLog lines={stream.lines} isRunning={stream.isRunning} title={t(ACTION_PROGRESS_KEYS[activeActionRef.current] ?? ACTION_PROGRESS_KEYS['install']!, { name: formula.name })} />
        {stream.isRunning && (
          <Text color={COLORS.textSecondary}>esc:{t('hint_cancel')}</Text>
        )}
        {!stream.isRunning && (
          <>
            <Text color={stream.error ? COLORS.error : COLORS.success} bold>
              {stream.error ? `\u2718 ${stream.error}` : `\u2714 ${t('pkgInfo_done')}`}
            </Text>
            <Text color={COLORS.textSecondary}>esc:{t('hint_back')}</Text>
          </>
        )}
      </Box>
    );
  }

  const installed = formula.installed[0];
  const isInstalled = formula.installed.length > 0;

  return (
    <Box flexDirection="column">
      {confirmAction && (
        <ConfirmDialog
          message={t(ACTION_CONFIRM_KEYS[confirmAction], { name: formula.name })}
          onConfirm={() => {
            const action = confirmAction;
            activeActionRef.current = action ?? 'install';
            hasRefreshed.current = false;
            setConfirmAction(null);
            if (action === 'install') void stream.run(['install', formula.name]);
            else if (action === 'uninstall') void stream.run(['uninstall', formula.name]);
            else if (action === 'upgrade') void stream.run(['upgrade', formula.name]);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      <Box gap={SPACING.sm} marginBottom={SPACING.xs}>
        <GradientText colors={GRADIENTS.gold} bold>{formula.name}</GradientText>
        <Text color={COLORS.teal}>{installed?.version ?? formula.versions.stable}</Text>
        {isInstalled && <StatusBadge label={t('badge_installed')} variant="success" />}
        {formula.outdated && <StatusBadge label={t('badge_outdated')} variant="warning" />}
        {formula.pinned && <StatusBadge label={t('badge_pinned')} variant="info" />}
        {formula.keg_only && <StatusBadge label={t('badge_kegOnly')} variant="muted" />}
        {formula.deprecated && <StatusBadge label={t('badge_deprecated')} variant="error" />}
      </Box>

      <Box flexDirection="column" gap={SPACING.xs}>
        <Text>{formula.desc}</Text>

        <Box flexDirection="column">
          <SectionHeader emoji={'\u{1F4CB}'} title={t('pkgInfo_details')} gradient={[COLORS.text, COLORS.muted]} />
          <Box borderStyle="round" borderColor={COLORS.border} paddingX={SPACING.sm} flexDirection="column">
            <Text><Text color={COLORS.muted}>{t('pkgInfo_homepage')}</Text> {formula.homepage}</Text>
            <Text><Text color={COLORS.muted}>{t('pkgInfo_license')}</Text>  {formula.license}</Text>
            <Text><Text color={COLORS.muted}>{t('pkgInfo_tap')}</Text>      {formula.tap}</Text>
            <Text><Text color={COLORS.muted}>{t('pkgInfo_stable')}</Text>   {formula.versions.stable}</Text>
            {installed && (
              <>
                <Text><Text color={COLORS.muted}>{t('pkgInfo_installed')}</Text> {installed.version} ({formatRelativeTime(installed.time)})</Text>
                <Text><Text color={COLORS.muted}>{t('pkgInfo_bottle')}</Text>    {installed.poured_from_bottle ? t('common_yes') : t('common_no')}</Text>
                <Text><Text color={COLORS.muted}>{t('pkgInfo_onRequest')}</Text> {installed.installed_on_request ? t('common_yes') : t('pkgInfo_noDependency')}</Text>
              </>
            )}
          </Box>
        </Box>

        {formula.dependencies.length > 0 && (
          <Box flexDirection="column">
            <SectionHeader emoji={'\u{1F517}'} title={t('pkgInfo_dependencies', { count: formula.dependencies.length })} gradient={GRADIENTS.ocean} />
            <Box paddingLeft={SPACING.sm} flexWrap="wrap" columnGap={2}>
              {/* Cap deps shown to avoid blowing the viewport; rest summarised. */}
              {formula.dependencies.slice(0, 30).map((dep) => (
                <Text key={dep} color={COLORS.muted}>{dep}</Text>
              ))}
              {formula.dependencies.length > 30 && (
                <Text color={COLORS.textSecondary} italic>{t('common_andMore', { count: formula.dependencies.length - 30 })}</Text>
              )}
            </Box>
          </Box>
        )}

        {formula.caveats && (
          <Box flexDirection="column">
            <SectionHeader emoji={'\u26A0\uFE0F'} title={t('pkgInfo_caveats')} color={COLORS.warning} />
            <Box borderStyle="round" borderColor={COLORS.warning} paddingX={SPACING.sm}>
              <Text color={COLORS.warning} wrap="wrap">{formula.caveats}</Text>
            </Box>
          </Box>
        )}
      </Box>

      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.textSecondary}>
          {isInstalled ? `u:${t('hint_uninstall')}` : `i:${t('hint_install')}`}
          {isInstalled && formula.outdated ? ` U:${t('hint_upgrade')}` : ''}
          {` esc:${t('hint_back')}`}
        </Text>
      </Box>
    </Box>
  );
}
