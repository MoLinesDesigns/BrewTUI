import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useBrewStore } from '../stores/brew-store.js';
import { useNavigationStore } from '../stores/navigation-store.js';
import { useDebounce } from '../hooks/use-debounce.js';
import { useBrewStream } from '../hooks/use-brew-stream.js';
import { formulaeToListItems, casksToListItems } from '../lib/brew-api.js';
import { SearchInput } from '../components/common/search-input.js';
import { StatusBadge } from '../components/common/status-badge.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { COLORS } from '../utils/colors.js';
import { truncate } from '../utils/format.js';
import { t } from '../i18n/index.js';
import { useModalStore } from '../stores/modal-store.js';
import { useContainerSize } from '../hooks/use-container-size.js';
import { useVisibleRows } from '../hooks/use-visible-rows.js';
import type { PackageListItem } from '../lib/types.js';
import { SPACING } from '../utils/spacing.js';

export function InstalledView() {
  const formulae = useBrewStore((s) => s.formulae);
  const casks = useBrewStore((s) => s.casks);
  const loading = useBrewStore((s) => s.loading);
  const errors = useBrewStore((s) => s.errors);
  const fetchInstalled = useBrewStore((s) => s.fetchInstalled);
  const navigate = useNavigationStore((s) => s.navigate);
  const selectPackage = useNavigationStore((s) => s.selectPackage);
  const { openModal, closeModal } = useModalStore();

  const containerRef = useRef<DOMElement>(null);
  const { width: containerWidth } = useContainerSize(containerRef);
  // Fallback to viewport width on first frame, before measureElement runs.
  const columns = containerWidth > 0 ? containerWidth : 80;
  const nameWidth = Math.max(12, Math.floor(columns * 0.35));
  const versionWidth = Math.max(8, Math.floor(columns * 0.15));
  // Reserve room for nameWidth + versionWidth + cursor (1) + gaps (~3) + badges.
  // Whatever is left over goes to the description column.
  const descWidth = Math.max(10, columns - nameWidth - versionWidth - 8);

  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState(0);
  const [tab, setTab] = useState<'formulae' | 'casks'>('formulae');
  const [isSearching, setIsSearching] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const debouncedFilter = useDebounce(filter, 200);
  const stream = useBrewStream();

  const listRows = useVisibleRows({
    reservedRows: isSearching ? 14 : 10,
    fallbackReservedRows: isSearching ? 18 : 14,
    minRows: 1,
  });
  const streamRows = useVisibleRows({
    reservedRows: 5,
    fallbackReservedRows: 14,
    minRows: 1,
  });

  useEffect(() => { fetchInstalled(); }, []);

  useEffect(() => {
    if (isSearching) {
      openModal();
      return () => { closeModal(); };
    }
    return undefined;
  }, [isSearching]);

  const allItems: PackageListItem[] = useMemo(() => {
    const items = tab === 'formulae'
      ? formulaeToListItems(formulae)
      : casksToListItems(casks);

    if (!debouncedFilter) return items;
    const lower = debouncedFilter.toLowerCase();
    return items.filter((p) =>
      p.name.toLowerCase().includes(lower) || p.desc.toLowerCase().includes(lower)
    );
  }, [formulae, casks, tab, debouncedFilter]);

  useViewInput((input, key) => {
    if (confirmUninstall) return;

    // SCR-12-I1: while a brew uninstall is streaming we promised "esc:cancel"
    // in the hint bar. Honour it by intercepting Esc here so it tears down the
    // child process instead of bubbling up to global navigation.
    if (stream.isRunning) {
      if (key.escape) stream.cancel();
      return;
    }

    // Stream finished but still showing — Esc dismisses and refreshes
    if (stream.lines.length > 0) {
      if (key.escape) {
        stream.clear();
        void fetchInstalled();
      }
      return;
    }

    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setFilter('');
      }
      return;
    }

    if (input === '/') {
      setIsSearching(true);
      return;
    }

    if ((input === 'u' || input === '1') && allItems[cursor]) {
      setConfirmUninstall(allItems[cursor].name);
      return;
    }

    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, Math.max(0, allItems.length - 1)));
    } else if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (input === 'g') {
      setCursor(0);
    } else if (input === 'G') {
      setCursor(Math.max(allItems.length - 1, 0));
    } else if (key.return && allItems[cursor]) {
      selectPackage(allItems[cursor].name, tab === 'formulae' ? 'formula' : 'cask');
      navigate('package-info');
    } else if (input === 'f' || input === '2') {
      setTab((t) => t === 'formulae' ? 'casks' : 'formulae');
      setCursor(0);
    }
  }, { isActive: true });

  if (loading.installed) return <Loading message={t('loading_installed')} />;
  if (errors.installed) return <ErrorMessage message={errors.installed} />;

  if (stream.isRunning || stream.lines.length > 0) {
    return (
      <Box flexDirection="column">
        <ProgressLog
          lines={stream.lines}
          isRunning={stream.isRunning}
          title={t('pkgInfo_uninstalling', { name: '...' })}
          maxVisible={streamRows}
        />
        {stream.isRunning && (
          <Text color={COLORS.textSecondary}>esc:{t('hint_cancel')}</Text>
        )}
        {!stream.isRunning && (
          <Box flexDirection="column" marginTop={SPACING.xs}>
            <ResultBanner
              status={stream.error ? 'error' : 'success'}
              message={stream.error ? `\u2718 ${stream.error}` : `\u2714 ${t('pkgInfo_done')}`}
            />
            <Text color={COLORS.textSecondary}>esc:{t('hint_back')}</Text>
          </Box>
        )}
      </Box>
    );
  }

  const MAX_VISIBLE_ROWS = listRows;
  const start = Math.max(0, cursor - Math.floor(MAX_VISIBLE_ROWS / 2));
  const visible = allItems.slice(start, start + MAX_VISIBLE_ROWS);

  return (
    <Box flexDirection="column" ref={containerRef}>
      {/* Tab selector — both tabs always have a round border so the tab bar
          height stays constant when switching (prevents content jump). The
          inactive tab uses a dim gray border to signal it is not selected. */}
      <Box marginBottom={SPACING.xs} gap={SPACING.xs}>
        <Box
          borderStyle="round"
          borderColor={tab === 'formulae' ? COLORS.info : COLORS.textSecondary}
          paddingX={SPACING.xs}
        >
          <Text bold={tab === 'formulae'} color={tab === 'formulae' ? COLORS.info : COLORS.textSecondary}>
            {'\u{1F4E6}'} {t('installed_formulaeCount', { count: formulae.length })}
          </Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor={tab === 'casks' ? COLORS.purple : COLORS.textSecondary}
          paddingX={SPACING.xs}
        >
          <Text bold={tab === 'casks'} color={tab === 'casks' ? COLORS.purple : COLORS.textSecondary}>
            {'\u{1F37A}'} {t('installed_casksCount', { count: casks.length })}
          </Text>
        </Box>
      </Box>

      {/* Uninstall confirmation */}
      {confirmUninstall && (
        <ConfirmDialog
          message={t('installed_confirmUninstall', { name: confirmUninstall })}
          onConfirm={() => {
            const name = confirmUninstall;
            setConfirmUninstall(null);
            void stream.run(['uninstall', name]).then(() => { fetchInstalled(); });
          }}
          onCancel={() => setConfirmUninstall(null)}
        />
      )}

      {/* Search bar */}
      {isSearching && (
        <Box marginBottom={SPACING.xs} borderStyle="round" borderColor={COLORS.gold} paddingX={SPACING.xs}>
          <SearchInput defaultValue={filter} onChange={setFilter} isActive={isSearching} />
        </Box>
      )}

      {/* Column header — 1 space prefix matches the 1-char cursor glyph in data
          rows; gap={SPACING.xs} is shared by both header and data rows via the parent Box,
          so widths must match: ' ' + gap(1) + padEnd(27) aligns with data rows. */}
      <Box gap={SPACING.xs} borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} borderColor={COLORS.border}>
        <Text color={COLORS.text} bold>{' '}{t('installed_col_package').padEnd(nameWidth)}</Text>
        <Text color={COLORS.text} bold>{t('installed_col_version').padEnd(versionWidth)}</Text>
        <Text color={COLORS.text} bold>{t('installed_col_status')}</Text>
      </Box>

      {/* Package list */}
      <Box flexDirection="column">
        {visible.length === 0 && (
          <Box paddingY={SPACING.xs} justifyContent="center">
            <Text color={COLORS.textSecondary} italic>{t('installed_noPackages')}</Text>
          </Box>
        )}
        {start > 0 && (
          <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreAbove', { count: start })}</Text>
        )}
        {visible.map((item, i) => {
          const idx = start + i;
          const isCurrent = idx === cursor;
          return (
            <SelectableRow key={item.name} isCurrent={isCurrent}>
              <Text bold={isCurrent} inverse={isCurrent} color={isCurrent ? COLORS.text : COLORS.muted}>
                {truncate(item.name, nameWidth).padEnd(nameWidth)}
              </Text>
              <Text color={COLORS.teal}>{item.version.padEnd(versionWidth)}</Text>
              {item.outdated && <StatusBadge label={t('badge_outdated')} variant="warning" />}
              {item.pinned && <StatusBadge label={t('badge_pinned')} variant="info" />}
              {item.kegOnly && <StatusBadge label={t('badge_kegOnly')} variant="muted" />}
              {item.installedAsDependency && <StatusBadge label={t('badge_dep')} variant="muted" />}
              {!item.outdated && !item.pinned && !item.kegOnly && !item.installedAsDependency && (
                <Text color={COLORS.textSecondary} dimColor>{truncate(item.desc, descWidth)}</Text>
              )}
            </SelectableRow>
          );
        })}
        {start + MAX_VISIBLE_ROWS < allItems.length && (
          <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreBelow', { count: allItems.length - start - MAX_VISIBLE_ROWS })}</Text>
        )}
      </Box>

      {/* Status bar */}
      <Box marginTop={SPACING.xs}>
        <Text color={COLORS.text} bold>
          {allItems.length > 0 ? `${cursor + 1}/${allItems.length}` : '0/0'}
        </Text>
      </Box>
    </Box>
  );
}
