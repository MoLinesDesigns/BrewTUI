import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Box, Text, type DOMElement } from 'ink';
import { useContainerSize } from './use-container-size.js';

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    measureElement: vi.fn(() => ({ width: 42, height: 7 })),
  };
});

function Probe() {
  const ref = useRef<DOMElement>(null);
  const { width, height } = useContainerSize(ref);
  return (
    <Box ref={ref}>
      <Text>{`${width}x${height}`}</Text>
    </Box>
  );
}

describe('useContainerSize', () => {
  it('returns measured size after layout', async () => {
    const { lastFrame } = render(<Probe />);
    await vi.waitFor(() => {
      expect(lastFrame()).toBe('42x7');
    });
  });

  it('returns 0x0 if ref is null on first paint', () => {
    function NullRef() {
      const ref = useRef<DOMElement>(null);
      const { width, height } = useContainerSize(ref);
      // Intentionally do NOT attach ref to anything.
      return <Text>{`${width}x${height}`}</Text>;
    }
    const { lastFrame } = render(<NullRef />);
    expect(lastFrame()).toBe('0x0');
  });
});
