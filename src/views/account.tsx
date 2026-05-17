import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { TextInput } from '@inkjs/ui';
import { useLicenseStore } from '../stores/license-store.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { Loading } from '../components/common/loading.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SectionHeader } from '../components/common/section-header.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t } from '../i18n/index.js';
import { formatDate } from '../utils/format.js';
import { redeemPromoCode } from '../lib/license/promo.js';
import { SPACING } from '../utils/spacing.js';

export function AccountView() {
  const { status, license, deactivate, revalidate, degradation } = useLicenseStore();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [promoMode, setPromoMode] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoResult, setPromoResult] = useState<{ success: boolean; message: string } | null>(null);
  const [revalidating, setRevalidating] = useState(false);

  useViewInput((input, key) => {
    if (confirmDeactivate || deactivating || promoMode || revalidating) {
      if (key.escape && promoMode) {
        setPromoMode(false);
        setPromoResult(null);
      }
      return;
    }

    if ((input === 'd' || input === '2') && status === 'pro') {
      setConfirmDeactivate(true);
    }
    if (input === 'p' || input === '1') {
      setPromoMode(true);
      setPromoResult(null);
    }
    if ((input === 'v' || input === 'V') && (status === 'pro' || status === 'team' || status === 'expired')) {
      setRevalidating(true);
      void revalidate().finally(() => setRevalidating(false));
    }
  });

  const maskKey = (key: string) => {
    if (key.length <= 8) return key;
    return key.slice(0, 4) + '-****-****-' + key.slice(-4);
  };

  if (status === 'validating') {
    return <Loading message={t('account_loading')} />;
  }

  return (
    <Box flexDirection="column">
      <SectionHeader emoji={'\u{1F464}'} title={t('account_title')} gradient={GRADIENTS.gold} />

      {confirmDeactivate && (
        <Box marginY={SPACING.xs}>
          <ConfirmDialog
            message={t('account_confirmDeactivate')}
            onConfirm={async () => {
              setConfirmDeactivate(false);
              setDeactivating(true);
              setDeactivateError(null);
              try {
                await deactivate();
              } catch (err) {
                // SCR-007: Display deactivation errors
                setDeactivateError(t('deactivate_failed') + ': ' + String(err));
              } finally {
                setDeactivating(false);
              }
            }}
            onCancel={() => setConfirmDeactivate(false)}
          />
        </Box>
      )}

      <Box flexDirection="column" marginTop={SPACING.xs} paddingLeft={SPACING.sm}>
        <Box gap={SPACING.xs}>
          <Text color={COLORS.muted}>{t('account_statusLabel')}</Text>
          {status === 'pro' && <Text color={COLORS.success} bold>{t('account_pro')}</Text>}
          {status === 'free' && <Text color={COLORS.muted}>{t('account_free')}</Text>}
          {status === 'expired' && <Text color={COLORS.error}>{t('account_expired')}</Text>}
        </Box>

        {(degradation === 'warning' || degradation === 'limited') && license && (
          <Box marginTop={SPACING.xs} borderStyle="round" borderColor={COLORS.warning} paddingX={SPACING.sm} paddingY={SPACING.none}>
            <Text color={COLORS.warning}>
              {t('license_offlineWarning', {
                days: Math.floor((Date.now() - new Date(license.lastValidatedAt).getTime()) / (24 * 60 * 60 * 1000)),
              })}
            </Text>
          </Box>
        )}

        {license && (
          <>
            <Box gap={SPACING.xs}>
              <Text color={COLORS.muted}>{t('account_emailLabel')}</Text>
              <Text>{license.customerEmail}</Text>
            </Box>
            <Box gap={SPACING.xs}>
              <Text color={COLORS.muted}>{t('account_nameLabel')}</Text>
              <Text>{license.customerName}</Text>
            </Box>
            <Box gap={SPACING.xs}>
              <Text color={COLORS.muted}>{t('account_planLabel')}</Text>
              <Text color={COLORS.success} bold>Pro</Text>
            </Box>
            <Box gap={SPACING.xs}>
              <Text color={COLORS.muted}>{t('account_keyLabel')}</Text>
              <Text>{maskKey(license.key)}</Text>
            </Box>
            {license.expiresAt && (
              <Box gap={SPACING.xs}>
                <Text color={COLORS.muted}>{t('account_expiresLabel')}</Text>
                <Text>{formatDate(license.expiresAt)}</Text>
              </Box>
            )}
            <Box gap={SPACING.xs}>
              <Text color={COLORS.muted}>{t('account_activatedLabel')}</Text>
              <Text>{formatDate(license.activatedAt)}</Text>
            </Box>
          </>
        )}

        {status === 'free' && (
          <Box flexDirection="column" marginTop={SPACING.xs} borderStyle="round" borderColor={COLORS.brand} paddingX={SPACING.sm} paddingY={SPACING.none} flexShrink={1}>
            <Text bold color={COLORS.brand}>{'\u2B50'} {t('account_upgradeTitle')}</Text>
            <Text wrap="wrap">{t('account_unlockDesc')}</Text>
            <Text color={COLORS.info} bold>{t('account_pricing')}</Text>
            <Text color={COLORS.muted}>{t('upgrade_buyAt')} <Text color={COLORS.sky} bold>{t('upgrade_buyUrl')}</Text></Text>
            <Text color={COLORS.muted}>{t('account_runActivate')} <Text color={COLORS.success} bold>{t('account_activateCmd')}</Text></Text>
          </Box>
        )}

        {status === 'expired' && (
          <Box marginTop={SPACING.xs}>
            <Box borderStyle="round" borderColor={COLORS.error} paddingX={SPACING.sm} paddingY={SPACING.none}>
              <Text color={COLORS.error}>{t('account_licenseExpired')}</Text>
            </Box>
          </Box>
        )}

        {deactivating && <Text color={COLORS.sky}>{t('account_deactivating')}</Text>}
        {deactivateError && <Text color={COLORS.error}>{deactivateError}</Text>}
      </Box>

      {/* Promo code section */}
      <Box flexDirection="column" marginTop={SPACING.xs} paddingLeft={SPACING.sm}>
        {promoMode ? (
          <Box flexDirection="column" gap={SPACING.xs}>
            <Text bold color={COLORS.gold}>{t('account_promoTitle')}</Text>
            {promoLoading ? (
              <Text color={COLORS.sky}>{t('account_promoValidating')}</Text>
            ) : (
              <Box gap={SPACING.xs}>
                <Text color={COLORS.muted}>{t('account_promoLabel')}</Text>
                <TextInput
                  defaultValue=""
                  placeholder="BREW-XXXX-XXXX"
                  onSubmit={async (value: string) => {
                    if (!value.trim()) return;
                    setPromoLoading(true);
                    try {
                      const result = await redeemPromoCode(value);
                      if (result.success) {
                        setPromoResult({ success: true, message: t('account_promoSuccess', { expires: formatDate(result.expiresAt!) }) });
                      } else {
                        setPromoResult({ success: false, message: result.error ?? t('account_promoInvalid') });
                      }
                    } catch {
                      setPromoResult({ success: false, message: t('account_promoError') });
                    } finally {
                      setPromoLoading(false);
                    }
                  }}
                />
              </Box>
            )}
            {promoResult && (
              <ResultBanner status={promoResult.success ? 'success' : 'error'} message={promoResult.message} />
            )}
            <Text color={COLORS.textSecondary} dimColor>{t('account_promoEsc')}</Text>
          </Box>
        ) : (
          <Text color={COLORS.textSecondary}>{t('account_promoHint')}</Text>
        )}
      </Box>

      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.textSecondary}>
          {(status === 'pro' || status === 'team') ? `d ${t('hint_deactivate')}  ` : ''}
          {(status === 'pro' || status === 'team' || status === 'expired')
            ? `v ${t('hint_revalidate')}  `
            : ''}
          {revalidating ? t('account_revalidating') : ''}
          {' '}{t('app_version', { version: process.env.APP_VERSION ?? '0.1.0' })}
        </Text>
      </Box>
    </Box>
  );
}
