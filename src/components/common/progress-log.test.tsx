import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { ProgressLog } from './progress-log.js';

describe('<ProgressLog>', () => {
  it('shows an empty-state message when idle with no lines', () => {
    const frame = render(<ProgressLog lines={[]} isRunning={false} />).lastFrame() ?? '';
    expect(frame.trim().length).toBeGreaterThan(0);
  });

  it('renders title and keeps only the most recent visible lines', () => {
    const frame = render(
      <ProgressLog
        title="Installing"
        isRunning={false}
        maxVisible={2}
        lines={['one', 'two', 'three']}
      />,
    ).lastFrame() ?? '';

    expect(frame).toContain('Installing');
    expect(frame).not.toContain('one');
    expect(frame).toContain('two');
    expect(frame).toContain('three');
  });
});
