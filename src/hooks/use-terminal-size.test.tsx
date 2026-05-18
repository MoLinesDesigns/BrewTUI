import React from 'react';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';

function makeStdout(initial: { columns: number; rows: number }) {
  const emitter = new EventEmitter() as EventEmitter & {
    columns: number;
    rows: number;
    write: (s: string) => boolean;
  };
  emitter.columns = initial.columns;
  emitter.rows = initial.rows;
  emitter.write = () => true;
  return emitter;
}

/** Populated in tests; `useStdout` reads from here because ink-testing-library does not expose custom stdout via `render` options. */
const stdoutHolder: { value: ReturnType<typeof makeStdout> | undefined } = {
  value: undefined,
};

vi.mock('ink', async () => {
  const real = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...real,
    useStdout: () => ({
      stdout: stdoutHolder.value,
      write: () => {},
    }),
  };
});

import { useTerminalSize } from './use-terminal-size.js';

function Probe() {
  const { columns, rows } = useTerminalSize();
  return <Text>{`${columns}x${rows}`}</Text>;
}

describe('useTerminalSize', () => {
  beforeEach(() => {
    stdoutHolder.value = makeStdout({ columns: 120, rows: 40 });
  });

  it('reports initial stdout dimensions', () => {
    stdoutHolder.value = makeStdout({ columns: 120, rows: 40 });
    const { lastFrame } = render(<Probe />);
    expect(lastFrame()).toBe('120x40');
  });

  it('updates when stdout emits resize', async () => {
    stdoutHolder.value = makeStdout({ columns: 80, rows: 24 });
    const { lastFrame, rerender } = render(<Probe />);
    expect(lastFrame()).toBe('80x24');
    stdoutHolder.value.columns = 120;
    stdoutHolder.value.rows = 36;
    stdoutHolder.value.emit('resize');
    await vi.waitFor(() => {
      rerender(<Probe />);
      expect(lastFrame()).toBe('120x36');
    });
  });

  it('falls back to 80x24 when stdout is missing', () => {
    stdoutHolder.value = undefined;
    const { lastFrame } = render(<Probe />);
    expect(lastFrame()).toBe('80x24');
  });

  it('registers at most one resize listener per stdout regardless of how many components mount', () => {
    // Regression: before useSyncExternalStore, every component that called
    // useTerminalSize (directly or via useContainerSize / useVisibleRows)
    // added its own listener. With ~6 views and ~4 StatCards mounted, Node
    // started emitting MaxListenersExceededWarning at 11 listeners.
    const stdout = makeStdout({ columns: 100, rows: 30 });
    stdoutHolder.value = stdout;

    function ManyProbes() {
      // 12 sibling probes — well over Node's default MaxListeners of 10.
      return (
        <>
          {Array.from({ length: 12 }).map((_, i) => (
            <Probe key={i} />
          ))}
        </>
      );
    }

    render(<ManyProbes />);
    expect(stdout.listenerCount('resize')).toBe(1);
  });
});
