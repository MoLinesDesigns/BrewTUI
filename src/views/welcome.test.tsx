import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';

const mocks = vi.hoisted(() => ({
  markOnboardingComplete: vi.fn(),
  inputHandler: null as ((input: string, key: { return?: boolean; escape?: boolean }) => void) | null,
}));

vi.mock('../lib/onboarding.js', () => ({ markOnboardingComplete: mocks.markOnboardingComplete }));
vi.mock('../hooks/use-view-input.js', () => ({
  useViewInput: (handler: typeof mocks.inputHandler) => {
    mocks.inputHandler = handler;
  },
}));

import { WelcomeView } from './welcome.js';

describe('<WelcomeView>', () => {
  it('renders first-run content', () => {
    const frame = render(<WelcomeView onContinue={vi.fn()} />).lastFrame() ?? '';
    expect(frame.trim().length).toBeGreaterThan(0);
  });

  it('marks onboarding complete before continuing on Enter', async () => {
    const onContinue = vi.fn();
    mocks.markOnboardingComplete.mockResolvedValue(undefined);
    render(<WelcomeView onContinue={onContinue} />);

    mocks.inputHandler?.('', { return: true });

    await vi.waitFor(() => expect(mocks.markOnboardingComplete).toHaveBeenCalled());
    await vi.waitFor(() => expect(onContinue).toHaveBeenCalled());
  });
});
