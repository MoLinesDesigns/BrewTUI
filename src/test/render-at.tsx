import { EventEmitter } from 'node:events';
import type React from 'react';
import { render } from 'ink-testing-library';

// Reusable test harness for responsive snapshots. `ink-testing-library`'s
// `render` does not accept a custom stdout, and Ink's `useStdout` reads from
// the patched stdout that Ink itself installs — so the only stable seam is the
// `useStdout` hook. We provide a per-test stdout-like emitter and a small
// helper that pairs it with the existing mock pattern set up in
// `use-terminal-size.test.tsx`.
//
// Usage in a test file (the file itself must register the vi.mock — vitest
// requires the mock factory to live at module top level):
//
//   import { renderAt, stdoutHolder } from '../test/render-at.js';
//
//   vi.mock('ink', async () => {
//     const real = await vi.importActual<typeof import('ink')>('ink');
//     return {
//       ...real,
//       useStdout: () => ({ stdout: stdoutHolder.value, write: () => {} }),
//     };
//   });
//
//   it('renders at 60 cols', () => {
//     const { lastFrame } = renderAt({ columns: 60, rows: 24 }, <MyView />);
//     expect(lastFrame()).toMatchSnapshot();
//   });

export interface TestStdout extends EventEmitter {
  columns: number;
  rows: number;
  write: (s: string) => boolean;
}

export function makeStdout(initial: { columns: number; rows: number }): TestStdout {
  const emitter = new EventEmitter() as TestStdout;
  emitter.columns = initial.columns;
  emitter.rows = initial.rows;
  emitter.write = () => true;
  return emitter;
}

// Shared holder. Tests assign before calling `renderAt`; the `vi.mock('ink')`
// in the test file reads from here.
export const stdoutHolder: { value: TestStdout | undefined } = { value: undefined };

export function renderAt(
  dimensions: { columns: number; rows: number },
  ui: React.ReactElement,
): ReturnType<typeof render> {
  stdoutHolder.value = makeStdout(dimensions);
  return render(ui);
}

/** Trigger a `resize` event on the active stdout. Tests that exercise reflow
 * should call this then await the next frame. */
export function emitResize(next: { columns: number; rows: number }): void {
  const stdout = stdoutHolder.value;
  if (!stdout) throw new Error('renderAt() was not called before emitResize()');
  stdout.columns = next.columns;
  stdout.rows = next.rows;
  stdout.emit('resize');
}
