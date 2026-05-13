import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { useViewInput } from '../hooks/use-view-input.js';
import { TextInput } from '@inkjs/ui';
import { useBrewStore } from '../stores/brew-store.js';
import { useBrewStream } from '../hooks/use-brew-stream.js';
import { Loading } from '../components/common/loading.js';
import { ProgressLog } from '../components/common/progress-log.js';
import { ConfirmDialog } from '../components/common/confirm-dialog.js';
import { ResultBanner } from '../components/common/result-banner.js';
import { COLORS } from '../utils/colors.js';
import { SelectableRow } from '../components/common/selectable-row.js';
import { t } from '../i18n/index.js';
import { useModalStore } from '../stores/modal-store.js';
import { useNavigationStore } from '../stores/navigation-store.js';
import * as api from '../lib/brew-api.js';
import { SPACING } from '../utils/spacing.js';

export function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ formulae: string[]; casks: string[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [confirmInstall, setConfirmInstall] = useState<string | null>(null);
  const stream = useBrewStream();
  const { openModal, closeModal } = useModalStore();
  const navigate = useNavigationStore((s) => s.navigate);
  const selectPackage = useNavigationStore((s) => s.selectPackage);
  const fetchInstalled = useBrewStore((s) => s.fetchInstalled);
  const hasRefreshed = useRef(false);

  // Suppress global Escape while results are showing so Escape clears results
  // rather than navigating away from this view.
  useEffect(() => {
    if (results !== null) {
      openModal();
      return () => { closeModal(); };
    }
    return undefined;
  }, [results]);

  const doSearch = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults(null);
      setSearchError(t('search_minChars'));
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const r = await api.search(term);
      setResults(r);
      setCursor(0);
    } catch (err) {
      setResults({ formulae: [], casks: [] });
      setSearchError(err instanceof Error ? err.message : t('search_failed'));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!stream.isRunning && !stream.error && stream.lines.length > 0 && !hasRefreshed.current) {
      hasRefreshed.current = true;
      void fetchInstalled();
    }
  }, [stream.isRunning, stream.error]);

  const MAX_VISIBLE = 20;
  const visibleFormulae = results ? results.formulae.slice(0, MAX_VISIBLE) : [];
  const visibleCasks = results ? results.casks.slice(0, MAX_VISIBLE) : [];
  const allVisible = [...visibleFormulae, ...visibleCasks];

  useViewInput((input, key) => {
    if (stream.isRunning) {
      if (key.escape) stream.cancel();
      return;
    }
    if (stream.lines.length > 0) {
      if (key.escape) {
        stream.clear();
      }
      return;
    }
    if (confirmInstall) return;

    if (key.return && !results) {
      void doSearch(query);
      return;
    }

    // Enter → navigate to package-info view (preview details, deps, caveats)
    if (key.return && allVisible[cursor]) {
      selectPackage(allVisible[cursor]);
      navigate('package-info');
      return;
    }

    // 'i' or '1' → install directly (with confirmation)
    if ((input === 'i' || input === '1') && allVisible[cursor]) {
      setConfirmInstall(allVisible[cursor]);
      return;
    }

    if (input === 'j' || key.downArrow) {
      setCursor((c) => Math.min(c + 1, Math.max(0, allVisible.length - 1)));
    } else if (input === 'k' || key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (key.escape) {
      setResults(null);
      setQuery('');
    }
  });

  if (stream.isRunning || stream.lines.length > 0) {
    return (
      <Box flexDirection="column">
        <ProgressLog
          lines={stream.lines}
          isRunning={stream.isRunning}
          title={t('search_installing')}
        />
        {stream.isRunning && (
          <Text color={COLORS.textSecondary}>esc:{t('hint_cancel')}</Text>
        )}
        {!stream.isRunning && (
          <Box flexDirection="column" marginTop={SPACING.xs}>
            <ResultBanner
              status={stream.error ? 'error' : 'success'}
              message={stream.error ? `\u2718 ${stream.error}` : `\u2714 ${t('search_installComplete')}`}
            />
            <Text color={COLORS.textSecondary}>esc:{t('hint_clear')}</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={SPACING.xs}>
        <Text color={COLORS.gold}>{'\u{1F50D}'} </Text>
        {!results ? (
          <TextInput
            placeholder={t('search_placeholder')}
            defaultValue={query}
            onChange={setQuery}
            onSubmit={() => void doSearch(query)}
          />
        ) : (
          <Text>{t('search_resultsFor')} "<Text bold color={COLORS.text}>{query}</Text>" <Text color={COLORS.textSecondary}>{t('search_escToClear')}</Text></Text>
        )}
      </Box>

      {searching && <Loading message={t('loading_searching')} />}

      {searchError && (
        <Box marginBottom={SPACING.xs}>
          <Text color={COLORS.error}>{searchError}</Text>
        </Box>
      )}

      {confirmInstall && (
        <ConfirmDialog
          message={t('search_confirmInstall', { name: confirmInstall })}
          onConfirm={() => {
            const name = confirmInstall;
            hasRefreshed.current = false;
            setConfirmInstall(null);
            void stream.run(['install', name]);
          }}
          onCancel={() => setConfirmInstall(null)}
        />
      )}

      {results && !searching && !confirmInstall && (
        <Box flexDirection="column">
          {visibleFormulae.length > 0 && (
            <Box flexDirection="column" marginBottom={SPACING.xs}>
              <Text bold color={COLORS.info}>{t('search_formulaeHeader', { count: results.formulae.length })}</Text>
              {visibleFormulae.map((name, i) => {
                const isCurrent = i === cursor;
                return (
                  <SelectableRow key={name} isCurrent={isCurrent}>
                    <Text bold={isCurrent} inverse={isCurrent}>{name}</Text>
                  </SelectableRow>
                );
              })}
              {results.formulae.length > MAX_VISIBLE && (
                <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreBelow', { count: results.formulae.length - MAX_VISIBLE })}</Text>
              )}
            </Box>
          )}

          {visibleCasks.length > 0 && (
            <Box flexDirection="column">
              <Text bold color={COLORS.purple}>{t('search_casksHeader', { count: results.casks.length })}</Text>
              {visibleCasks.map((name, i) => {
                const idx = visibleFormulae.length + i;
                const isCurrent = idx === cursor;
                return (
                  <SelectableRow key={name} isCurrent={isCurrent}>
                    <Text bold={isCurrent} inverse={isCurrent}>{name}</Text>
                  </SelectableRow>
                );
              })}
              {results.casks.length > MAX_VISIBLE && (
                <Text color={COLORS.textSecondary} dimColor>  {t('scroll_moreBelow', { count: results.casks.length - MAX_VISIBLE })}</Text>
              )}
            </Box>
          )}

          {allVisible.length === 0 && (
            <Box borderStyle="round" borderColor={COLORS.textSecondary} paddingX={SPACING.sm}>
              <Text color={COLORS.textSecondary} italic>{t('search_noResults')}</Text>
            </Box>
          )}

          <Box marginTop={SPACING.xs}>
            <Text color={COLORS.text} bold>
              {allVisible.length > 0 ? `${cursor + 1}/${allVisible.length}` : ''}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
