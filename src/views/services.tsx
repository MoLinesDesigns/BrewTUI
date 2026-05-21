import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useContainerSize } from '../hooks/use-container-size.js';
import { useBrewStore } from '../stores/brew-store.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { StatusBadge } from '../components/common/status-badge.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { SectionHeader } from '../components/common/section-header.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { t } from '../i18n/index.js';
import { SPACING, getLayoutMode } from '../utils/spacing.js';
import { useVisibleRows } from '../hooks/use-visible-rows.js';

const STATUS_VARIANTS = {
  started: 'success',
  stopped: 'muted',
  error: 'error',
  none: 'muted',
} as const;

// UI-007: brew services that need root surface as EACCES / "Operation not
// permitted" / "sudo required" — translate that into actionable feedback.
function humaniseServiceError(message: string): string {
  if (/EACCES|operation not permitted|permission denied|sudo/i.test(message)) {
    return t('services_errorPermission');
  }
  return message;
}

export function ServicesView() {
  // PERF-001: selectors granulares — antes el componente se re-renderizaba ante
  // cualquier cambio de `brew-store` (incluso fetches de paquetes no usados).
  const services = useBrewStore((s) => s.services);
  const loading = useBrewStore((s) => s.loading);
  const errors = useBrewStore((s) => s.errors);
  const fetchServices = useBrewStore((s) => s.fetchServices);
  const serviceAction = useBrewStore((s) => s.serviceAction);
  const [cursor, setCursor] = useState(0);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'stop' | 'restart'; name: string } | null>(null);
  // SCR-014: Persist last error until explicitly cleared
  const [lastError, setLastError] = useState<string | null>(null);
  const containerRef = useRef<DOMElement>(null);
  const { width: containerWidth } = useContainerSize(containerRef);
  const cols = containerWidth > 0 ? containerWidth : 80;
  const mode = getLayoutMode(cols);
  // Widths are passed to <Box width=...>; Yoga handles truncation via
  // <Text wrap="truncate">. No padEnd string-building (the old approach
  // misaligned header vs row by -2). minWidth=0 + flexShrink=1 enable
  // shrink-below-content (the CSS `min-width: 0` pattern).
  const svcNameWidth = mode === 'single'
    ? Math.max(8, cols - 2 /* cursor + gap */)
    : Math.max(12, Math.floor(cols * 0.35));
  const svcStatusWidth = Math.max(8, Math.floor(cols * 0.15));
  const MAX_VISIBLE_ROWS = useVisibleRows({
    reservedRows: lastError || actionInProgress ? 8 : 6,
    fallbackReservedRows: lastError || actionInProgress ? 16 : 14,
    minRows: 1,
  });

  useEffect(() => { fetchServices(); }, []);

  useViewInput((input, key) => {
    if (actionInProgress) return;
    if (confirmAction) return;

    // Clear last error on any key press
    if (lastError) { setLastError(null); }

    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, Math.max(0, services.length - 1)));
    } else if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (input === 'r' || input === '4') {
      void fetchServices();
    }

    const svc = services[cursor];
    if (!svc) return;

    const doAction = (action: 'start' | 'stop' | 'restart') => {
      setActionInProgress(true);
      void serviceAction(svc.name, action)
        .catch((err) => {
          setLastError(humaniseServiceError(err instanceof Error ? err.message : String(err)));
        })
        .finally(() => {
          setActionInProgress(false);
          // SCR-014: Check store for errors after action
          const storeError = useBrewStore.getState().errors['service-action'];
          if (storeError) setLastError(humaniseServiceError(storeError));
        });
    };

    if (input === 's' || input === '1') doAction('start');
    else if (input === 'x' || input === '2') setConfirmAction({ type: 'stop', name: svc.name });
    else if (input === 'R' || input === '3') setConfirmAction({ type: 'restart', name: svc.name });
  });

  if (loading.services) return <Loading message={t('loading_services')} />;
  if (errors.services) return <ErrorMessage message={errors.services} />;

  if (services.length === 0) {
    return (
      <Box flexDirection="column">
        <SectionHeader emoji={'\u2699\uFE0F'} title={t('services_title')} gradient={GRADIENTS.ocean} />
        <Text color={COLORS.textSecondary} italic>{t('services_noServices')}</Text>
      </Box>
    );
  }

  const start = Math.max(0, cursor - Math.floor(MAX_VISIBLE_ROWS / 2));
  const visible = services.slice(start, start + MAX_VISIBLE_ROWS);

  return (
    <Box flexDirection="column" ref={containerRef}>
      <SectionHeader emoji={'\u2699\uFE0F'} title={t('services_titleCount', { count: services.length })} gradient={GRADIENTS.ocean} />

      {confirmAction && (
        <Box marginY={SPACING.xs}>
          <ConfirmDialog
            message={
              confirmAction.type === 'stop'
                ? t('services_confirmStop', { name: confirmAction.name })
                : t('services_confirmRestart', { name: confirmAction.name })
            }
            onConfirm={() => {
              const { type, name } = confirmAction;
              setConfirmAction(null);
              setActionInProgress(true);
              void serviceAction(name, type)
                .catch((err) => {
                  setLastError(err instanceof Error ? err.message : String(err));
                })
                .finally(() => {
                  setActionInProgress(false);
                  const storeError = useBrewStore.getState().errors['service-action'];
                  if (storeError) setLastError(storeError);
                });
            }}
            onCancel={() => setConfirmAction(null)}
          />
        </Box>
      )}

      <Box flexDirection="column" marginTop={SPACING.xs}>
        <Box gap={SPACING.xs} borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} borderColor={COLORS.border} paddingBottom={SPACING.none}>
          <Text bold color={COLORS.text}>{' '}</Text>
          <Box width={svcNameWidth} flexShrink={1} minWidth={0}>
            <Text bold color={COLORS.text} wrap="truncate">{t('services_name')}</Text>
          </Box>
          {mode !== 'single' && (
            <Box width={svcStatusWidth} flexShrink={1} minWidth={0}>
              <Text bold color={COLORS.text} wrap="truncate">{t('services_status')}</Text>
            </Box>
          )}
          {mode !== 'single' && mode !== 'compact' && (
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text bold color={COLORS.text} wrap="truncate">{t('services_user')}</Text>
            </Box>
          )}
        </Box>

        {start > 0 && (
          <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreAbove', { count: start })}</Text>
        )}

        {visible.map((svc, i) => {
          const idx = start + i;
          const isCurrent = idx === cursor;
          return (
            <SelectableRow key={svc.name} isCurrent={isCurrent}>
              <Box width={svcNameWidth} flexShrink={1} minWidth={0}>
                <Text
                  bold={isCurrent}
                  inverse={isCurrent}
                  color={isCurrent ? COLORS.text : COLORS.muted}
                  wrap="truncate-middle"
                >
                  {svc.name}
                </Text>
              </Box>
              {mode !== 'single' && (
                <Box width={svcStatusWidth} flexShrink={1} minWidth={0}>
                  <StatusBadge label={svc.status} variant={STATUS_VARIANTS[svc.status]} />
                </Box>
              )}
              {mode !== 'single' && mode !== 'compact' && (
                <Box flexGrow={1} flexShrink={1} minWidth={0} gap={SPACING.xs}>
                  <Text color={COLORS.muted} wrap="truncate">{svc.user ?? '-'}</Text>
                  {svc.exit_code != null && svc.exit_code !== 0 && (
                    <Text color={COLORS.error}>{t('common_exit', { code: svc.exit_code })}</Text>
                  )}
                </Box>
              )}
            </SelectableRow>
          );
        })}

        {start + MAX_VISIBLE_ROWS < services.length && (
          <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreBelow', { count: services.length - start - MAX_VISIBLE_ROWS })}</Text>
        )}
      </Box>

      {actionInProgress && <Text color={COLORS.sky}>{t('services_processing')}</Text>}

      {/* SCR-014: Persistent error display */}
      {lastError && (
        <Box marginTop={SPACING.xs}>
          <Text color={COLORS.error}>{lastError}</Text>
        </Box>
      )}

      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.text} bold>
          {cursor + 1}/{services.length}
        </Text>
      </Box>
    </Box>
  );
}
