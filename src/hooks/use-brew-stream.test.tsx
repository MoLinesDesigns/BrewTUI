import React, { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';

const mocks = vi.hoisted(() => ({
  streamBrew: vi.fn(),
  appendEntry: vi.fn(),
  detectAction: vi.fn(),
  captureSnapshot: vi.fn(),
  saveSnapshot: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../lib/brew-cli.js', () => ({ streamBrew: mocks.streamBrew }));
vi.mock('../lib/history/history-logger.js', () => ({
  detectAction: mocks.detectAction,
  appendEntry: mocks.appendEntry,
}));
vi.mock('../lib/state-snapshot/snapshot.js', () => ({
  captureSnapshot: mocks.captureSnapshot,
  saveSnapshot: mocks.saveSnapshot,
}));
vi.mock('../stores/license-store.js', () => ({
  useLicenseStore: {
    getState: () => ({ isPro: () => true }),
  },
}));
vi.mock('../utils/logger.js', () => ({ logger: { warn: mocks.warn } }));

import { useBrewStream } from './use-brew-stream.js';

function Probe({ onState }: { onState: (state: ReturnType<typeof useBrewStream>) => void }) {
  const state = useBrewStream();
  useEffect(() => onState(state), [onState, state]);
  return <Text>{state.lines.join('|') || state.error || (state.isRunning ? 'running' : 'idle')}</Text>;
}

async function waitForState(get: () => ReturnType<typeof useBrewStream> | undefined) {
  await vi.waitFor(() => expect(get()).toBeDefined());
  return get()!;
}

describe('useBrewStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectAction.mockReturnValue({ action: 'install', packageName: 'wget' });
    mocks.captureSnapshot.mockResolvedValue({ formulae: [], casks: [], taps: [] });
    mocks.saveSnapshot.mockResolvedValue(undefined);
  });

  it('streams lines, logs history and captures snapshots for mutating commands', async () => {
    mocks.streamBrew.mockImplementation(async function* () {
      yield 'line-1';
      yield 'line-2';
    });
    let latest: ReturnType<typeof useBrewStream> | undefined;
    render(<Probe onState={(s) => { latest = s; }} />);
    const state = await waitForState(() => latest);

    await state.run(['install', 'wget']);

    await vi.waitFor(() => {
      expect(latest?.lines).toEqual(['line-1', 'line-2']);
      expect(latest?.isRunning).toBe(false);
    });
    await vi.waitFor(() => expect(mocks.appendEntry).toHaveBeenCalledWith(true, 'install', 'wget', true, null));
    await vi.waitFor(() => expect(mocks.saveSnapshot).toHaveBeenCalled());
  });

  it('stores stream errors and logs failed history entries', async () => {
    mocks.streamBrew.mockImplementation(async function* () {
      yield 'before-error';
      throw new Error('brew failed');
    });
    let latest: ReturnType<typeof useBrewStream> | undefined;
    render(<Probe onState={(s) => { latest = s; }} />);
    const state = await waitForState(() => latest);

    await state.run(['upgrade', 'wget']);

    await vi.waitFor(() => {
      expect(latest?.lines).toEqual(['before-error']);
      expect(latest?.error).toBe('brew failed');
    });
    await vi.waitFor(() => expect(mocks.appendEntry).toHaveBeenCalledWith(true, 'install', 'wget', false, 'brew failed'));
  });

  it('clear resets lines and error', async () => {
    mocks.streamBrew.mockImplementation(async function* () {
      if (process.env.BREW_TUI_TEST_YIELD === '1') yield '';
      throw new Error('boom');
    });
    let latest: ReturnType<typeof useBrewStream> | undefined;
    render(<Probe onState={(s) => { latest = s; }} />);
    const state = await waitForState(() => latest);

    await state.run(['list']);
    latest!.clear();

    await vi.waitFor(() => {
      expect(latest?.lines).toEqual([]);
      expect(latest?.error).toBeNull();
    });
  });
});
