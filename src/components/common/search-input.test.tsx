import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { SearchInput } from './search-input.js';

describe('<SearchInput>', () => {
  it('renders inactive value as text', () => {
    const frame = render(<SearchInput defaultValue="wget" onChange={vi.fn()} isActive={false} />).lastFrame() ?? '';
    expect(frame).toContain('wget');
  });

  it('uses placeholder text when inactive without a value', () => {
    const frame = render(<SearchInput placeholder="Search packages" onChange={vi.fn()} isActive={false} />).lastFrame() ?? '';
    expect(frame).toContain('Search packages');
  });

  it('renders the active TextInput without crashing', () => {
    expect(() => render(<SearchInput defaultValue="git" onChange={vi.fn()} />)).not.toThrow();
  });
});
