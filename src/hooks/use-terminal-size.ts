import { useEffect, useState } from 'react';
import { useStdout } from 'ink';

export interface TerminalSize {
  columns: number;
  rows: number;
}

// Reactive viewport hook. Equivalent of `100vw` / `100vh` in CSS.
//
// `stdout.columns` / `stdout.rows` are mutable properties that change on
// SIGWINCH but do not trigger React re-renders. We listen for `resize` and
// snapshot the values into state so consumers re-render naturally.
//
// The listener is registered once per mount and removed on unmount. We do not
// debounce: terminal resizes are user-driven and infrequent, and any debounce
// would introduce a perceptible lag during window drag.
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => ({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  }));

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setSize({
        columns: stdout.columns ?? 80,
        rows: stdout.rows ?? 24,
      });
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}
