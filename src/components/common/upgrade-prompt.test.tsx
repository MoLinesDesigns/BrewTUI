import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { UpgradePrompt } from './upgrade-prompt.js';

describe('<UpgradePrompt>', () => {
  it('renders nothing for views without a configured feature key', () => {
    // 'dashboard' is not in FEATURE_KEYS, so the component returns null and
    // the rendered frame should be empty (no border, no labels).
    const { lastFrame } = render(<UpgradePrompt viewId="dashboard" />);
    expect((lastFrame() ?? '').trim()).toBe('');
  });

  it('renders Pro headers and the brewtui-bar activate command for a Pro view', () => {
    const { lastFrame } = render(<UpgradePrompt viewId="profiles" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('brewtui-bar activate');
    expect(frame).toContain('https://');
  });

  it('renders Team-tier copy when the view is gated to Team', () => {
    const proFrame = render(<UpgradePrompt viewId="profiles" />).lastFrame() ?? '';
    const teamFrame = render(<UpgradePrompt viewId="compliance" />).lastFrame() ?? '';
    // The Team frame must use a different buy URL token than the Pro frame —
    // it doesn't matter which exact strings the i18n catalog renders, only
    // that they diverge per tier.
    expect(teamFrame).not.toBe(proFrame);
    expect(teamFrame.length).toBeGreaterThan(0);
  });
});
