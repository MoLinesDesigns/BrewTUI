import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';

vi.mock('../stores/history-store.js', async () => {
  const { create } = await import('zustand');
  // Must match the keys HistoryView destructures (fetchHistory, clearHistory).
  // The previous mock had `load: vi.fn()`, leaving fetchHistory undefined —
  // the useEffect that calls it threw a TypeError mid-mount, and React's
  // recovery path emitted a spurious "two children with the same key" warning
  // where the "key" was a fragment of the error stack.
  const useHistoryStore = create<any>(() => ({
    entries: [],
    loading: false,
    error: null,
    fetchHistory: vi.fn(),
    clearHistory: vi.fn(),
  }));
  return { useHistoryStore };
});

vi.mock('../stores/license-store.js', async () => {
  const { create } = await import('zustand');
  const useLicenseStore = create<any>(() => ({
    isPro: () => true,
  }));
  return { useLicenseStore };
});

import { HistoryView } from './history.js';

describe('<HistoryView>', () => {
  it('renders without crashing', () => {
    expect(() => render(<HistoryView />)).not.toThrow();
  });
});
