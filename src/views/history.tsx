import React, { useEffect, useState, useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { useHistoryStore } from '../stores/history-store.js';
import { useBrewStream } from '../hooks/use-brew-stream.js';
import { useDebounce } from '../hooks/use-debounce.js';
import { Loading, ErrorMessage } from '../components/common/loading.js';
import { StatusBadge } from '../components/common/status-badge.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { SearchInput } from '../components/common/search-input.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { SectionHeader } from '../components/common/section-header.js';
import { COLORS } from '../utils/colors.js';
import { GRADIENTS } from '../utils/gradient.js';
import { formatRelativeTime } from '../utils/format.js';
import { t } from '../i18n/index.js';
import { useModalStore } from '../stores/modal-store.js';
import type { TranslationKey } from '../i18n/en.js';
import type { HistoryAction, HistoryEntry } from '../lib/history/types.js';
import { SPACING } from '../utils/spacing.js';

const ACTION_ICONS: Record<HistoryAction, { icon: string; color: string }> = {
  install: { icon: '+', color: COLORS.success },
  uninstall: { icon: '-', color: COLORS.error },
  upgrade: { icon: '\u2191', color: COLORS.info },
  'upgrade-all': { icon: '\u21C8', color: COLORS.info },
};

const ACTION_LABEL_KEYS: Record<HistoryAction, TranslationKey> = {
  install: 'history_actionInstall',
  uninstall: 'history_actionUninstall',
  upgrade: 'history_actionUpgrade',
  'upgrade-all': 'history_actionUpgradeAll',
};

const FILTERS: (HistoryAction | 'all')[] = ['all', 'install', 'uninstall', 'upgrade', 'upgrade-all'];

export function HistoryView() {
  const { entries, loading, error, fetchHistory, clearHistory } = useHistoryStore();
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState<HistoryAction | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmReplay, setConfirmReplay] = useState<HistoryEntry | null>(null);
  const stream = useBrewStream();
  const debouncedQuery = useDebounce(searchQuery, 200);
  const { openModal, closeModal } = useModalStore();
  // PERF-006: useStdout has to be called unconditionally on every render — the
  // previous version invoked it after early returns, which violates rules of
  // hooks the moment loading/error flips and changes the hook count.
  const { stdout } = useStdout();
  const MAX_VISIBLE_ROWS = Math.max(5, (stdout?.rows ?? 24) - 8);

  useEffect(() => { fetchHistory(); }, []);

  // Suppress global Escape while search bar is active so Escape clears the
  // search bar rather than navigating away from the history view.
  useEffect(() => {
    if (isSearching) {
      openModal();
      return () => { closeModal(); };
    }
    return undefined;
  }, [isSearching]);

  const filtered = useMemo(() => {
    let result = entries;
    if (filter !== 'all') {
      result = result.filter((e) => e.action === filter);
    }
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter((e) => e.packageName?.toLowerCase().includes(q));
    }
    return result;
  }, [entries, filter, debouncedQuery]);

  useViewInput((input, key) => {
    if (confirmClear || confirmReplay || stream.isRunning) return;

    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery('');
      }
      return;
    }

    if (input === '/') { setIsSearching(true); return; }
    if (input === 'f' || input === '1') {
      const idx = FILTERS.indexOf(filter);
      setFilter(FILTERS[(idx + 1) % FILTERS.length]!);
      setCursor(0);
      return;
    }
    if ((input === 'c' || input === '2') && entries.length > 0) { setConfirmClear(true); return; }
    if (key.return && filtered[cursor]) {
      setConfirmReplay(filtered[cursor]);
      return;
    }

    if (input === 'j' || key.downArrow) setCursor((c) => Math.min(c + 1, Math.max(0, filtered.length - 1)));
    else if (input === 'k' || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
  });

  if (loading) return <Loading message={t('loading_history')} />;
  if (error) return <ErrorMessage message={error} />;

  const start = Math.max(0, cursor - Math.floor(MAX_VISIBLE_ROWS / 2));
  const visible = filtered.slice(start, start + MAX_VISIBLE_ROWS);

  return (
    <Box flexDirection="column">
      <Box gap={SPACING.sm} marginBottom={SPACING.xs}>
        <SectionHeader emoji={'\u{1F4DC}'} title={t('history_title', { count: filtered.length })} gradient={GRADIENTS.gold} />
        <Text color={filter === 'all' ? COLORS.text : COLORS.gold}>
          {t('history_filterLabel', { filter })}
        </Text>
      </Box>

      {isSearching && (
        <Box marginBottom={SPACING.xs}>
          <SearchInput defaultValue={searchQuery} onChange={setSearchQuery} placeholder={t('history_searchPlaceholder')} isActive />
        </Box>
      )}

      {confirmClear && (
        <ConfirmDialog
          message={t('history_confirmClear', { count: entries.length })}
          onConfirm={() => { void clearHistory(); setConfirmClear(false); }}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {confirmReplay && (
        <ConfirmDialog
          message={
            confirmReplay.action === 'upgrade-all'
              ? t('history_replayAll') + '\n' + t('upgrade_all_warning')
              : t('history_confirmReplay', { action: t(ACTION_LABEL_KEYS[confirmReplay.action]), name: confirmReplay.packageName ?? '' })
          }
          onConfirm={async () => {
            const entry = confirmReplay;
            setConfirmReplay(null);
            let args: string[];
            switch (entry.action) {
              case 'install': args = ['install', entry.packageName!]; break;
              case 'uninstall': args = ['uninstall', entry.packageName!]; break;
              case 'upgrade': args = ['upgrade', entry.packageName!]; break;
              case 'upgrade-all': args = ['upgrade']; break;
            }
            await stream.run(args);
            void fetchHistory();
          }}
          onCancel={() => setConfirmReplay(null)}
        />
      )}

      {(stream.isRunning || stream.lines.length > 0) && (
        <Box marginY={SPACING.xs}>
          <ProgressLog lines={stream.lines} isRunning={stream.isRunning} title={t('hint_replay')} />
        </Box>
      )}

      {filtered.length === 0 && !confirmClear && (
        <Text color={COLORS.textSecondary} italic>
          {filter !== 'all' ? t('history_noEntriesFor', { filter }) : t('history_noEntries')}
        </Text>
      )}

      {filtered.length > 0 && !confirmClear && (
        <Box flexDirection="column">
          {start > 0 && (
            <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreAbove', { count: start })}</Text>
          )}
          {visible.map((entry, i) => {
            const idx = start + i;
            const isCurrent = idx === cursor;
            const { icon, color } = ACTION_ICONS[entry.action];
            const ts = new Date(entry.timestamp).getTime() / 1000;

            return (
              <SelectableRow key={entry.id} isCurrent={isCurrent}>
                <Text color={color} bold>{icon}</Text>
                <Text bold={isCurrent} inverse={isCurrent} color={isCurrent ? COLORS.text : COLORS.muted}>
                  {t(ACTION_LABEL_KEYS[entry.action]).padEnd(12)}
                </Text>
                <Text color={COLORS.text}>{entry.packageName ?? t('history_all')}</Text>
                {entry.success
                  ? <StatusBadge label={t('badge_ok')} variant="success" />
                  : <StatusBadge label={t('badge_fail')} variant="error" />}
                <Text color={COLORS.muted}>{formatRelativeTime(ts)}</Text>
              </SelectableRow>
            );
          })}
          {start + MAX_VISIBLE_ROWS < filtered.length && (
            <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreBelow', { count: filtered.length - start - MAX_VISIBLE_ROWS })}</Text>
          )}

          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.text} bold>
              {cursor + 1}/{filtered.length}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
