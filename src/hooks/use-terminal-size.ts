import { useSyncExternalStore } from 'react';
import { useStdout } from 'ink';

export interface TerminalSize {
  columns: number;
  rows: number;
}

// Reactive viewport hook. Equivalent of `100vw` / `100vh` in CSS.
//
// `stdout.columns` / `stdout.rows` are mutable properties that change on
// SIGWINCH but do not trigger React re-renders. We listen for `resize` and
// snapshot the values into a per-stdout shared store, so:
//
//   - At most ONE `resize` listener is registered per stdout, regardless of
//     how many React components call `useTerminalSize`. The previous
//     per-component listener model triggered Node's
//     `MaxListenersExceededWarning` once enough views/components mounted
//     simultaneously (each useVisibleRows / useContainerSize call piles up
//     because they transitively use this hook).
//   - The cache is keyed by the stdout reference itself via WeakMap so test
//     stdouts and the production process.stdout do not share state.
//   - We do NOT debounce: terminal resizes are user-driven and infrequent;
//     debounce would introduce perceptible lag during window drag.

const FALLBACK: TerminalSize = { columns: 80, rows: 24 };

interface StdoutLike {
  columns?: number;
  rows?: number;
  on(event: 'resize', listener: () => void): unknown;
  off(event: 'resize', listener: () => void): unknown;
}

interface CacheEntry {
  current: TerminalSize;
  subscribers: Set<() => void>;
}

const cache = new WeakMap<StdoutLike, CacheEntry>();

function snapshot(stdout: StdoutLike): TerminalSize {
  return {
    columns: stdout.columns ?? FALLBACK.columns,
    rows: stdout.rows ?? FALLBACK.rows,
  };
}

function getCache(stdout: StdoutLike): CacheEntry {
  const existing = cache.get(stdout);
  if (existing) return existing;
  const entry: CacheEntry = {
    current: snapshot(stdout),
    subscribers: new Set(),
  };
  cache.set(stdout, entry);
  // One listener per stdout, lives for the stdout's lifetime. It does not
  // need to be removed — when the stdout is GC'd the listener goes with it.
  stdout.on('resize', () => {
    entry.current = snapshot(stdout);
    entry.subscribers.forEach((cb) => cb());
  });
  return entry;
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout() as { stdout: StdoutLike | undefined };
  return useSyncExternalStore(
    (cb) => {
      if (!stdout) return () => {};
      const entry = getCache(stdout);
      entry.subscribers.add(cb);
      return () => {
        entry.subscribers.delete(cb);
      };
    },
    () => (stdout ? getCache(stdout).current : FALLBACK),
    // Server snapshot — not used in CLI, but useSyncExternalStore requires it.
    () => FALLBACK,
  );
}
