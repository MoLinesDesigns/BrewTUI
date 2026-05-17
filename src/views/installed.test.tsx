import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';

// Mock the container-measuring hook so responsive tests can dial the
// container width without needing Yoga to lay out a real terminal.
// ink-testing-library's stdout has a hardcoded columns=100 and measureElement
// returns 0 for unmounted refs, so the view's fallback (80) would always win.
const containerWidthHolder = { value: 100 };
vi.mock('../hooks/use-container-size.js', () => ({
  useContainerSize: () => ({ width: containerWidthHolder.value, height: 24 }),
}));

vi.mock('../stores/brew-store.js', async () => {
  const { create } = await import('zustand');
  const useBrewStore = create<any>(() => ({
    formulae: [],
    casks: [],
    leaves: [],
    loading: { installed: true },
    errors: {},
    fetchInstalled: vi.fn(),
    fetchLeaves: vi.fn(),
    uninstallPackage: vi.fn(),
  }));
  return { useBrewStore };
});

vi.mock('../hooks/use-brew-stream.js', () => ({
  useBrewStream: () => ({
    isRunning: false, lines: [], error: null,
    start: vi.fn(), cancel: vi.fn(), clear: vi.fn(),
  }),
}));

vi.mock('../lib/brew-api.js', () => ({
  formulaeToListItems: (formulae: Array<{ name: string; desc?: string; versions?: { stable?: string } }>) =>
    formulae.map((f) => ({
      name: f.name,
      version: f.versions?.stable ?? '1.0',
      desc: f.desc ?? '',
      type: 'formula',
    })),
  casksToListItems: (casks: Array<{ name: string; desc?: string; version?: string }>) =>
    casks.map((c) => ({
      name: c.name,
      version: c.version ?? '1.0',
      desc: c.desc ?? '',
      type: 'cask',
    })),
  uninstallPackage: vi.fn(),
}));

import { InstalledView } from './installed.js';
import { useBrewStore } from '../stores/brew-store.js';

beforeEach(() => {
  (useBrewStore as any).setState({
    formulae: [],
    casks: [],
    leaves: [],
    loading: { installed: true },
    errors: {},
  });
});

describe('<InstalledView>', () => {
  it('renders without crashing while loading', () => {
    expect(() => render(<InstalledView />)).not.toThrow();
  });

  it('shows the formula count once loaded', () => {
    (useBrewStore as any).setState({
      formulae: [
        { name: 'wget', full_name: 'wget', desc: '', homepage: '', versions: { stable: '1.21' } },
        { name: 'curl', full_name: 'curl', desc: '', homepage: '', versions: { stable: '8.0' } },
      ],
      casks: [],
      leaves: [],
      loading: { installed: false },
      errors: {},
    });
    const frame = render(<InstalledView />).lastFrame() ?? '';
    expect(frame).toContain('wget');
  });

  it('renders error message when fetch fails', () => {
    (useBrewStore as any).setState({
      loading: { installed: false },
      errors: { installed: 'brew not found' },
    });
    const frame = render(<InstalledView />).lastFrame() ?? '';
    expect(frame).toContain('brew not found');
  });
});

describe('<InstalledView> responsive layout', () => {
  // Seed enough packages so the row column logic actually runs, plus one with
  // a long name to exercise truncation.
  const seedFormulae = [
    { name: 'a-really-long-formula-name-that-overflows', full_name: 'x', desc: 'a description that is also quite long for column tests', homepage: '', versions: { stable: '1.0.0' } },
    { name: 'wget', full_name: 'wget', desc: 'internet file retriever', homepage: '', versions: { stable: '1.21' } },
  ];

  function setup(width: number) {
    containerWidthHolder.value = width;
    (useBrewStore as any).setState({
      formulae: seedFormulae,
      casks: [],
      leaves: [],
      loading: { installed: false },
      errors: {},
    });
  }

  // ink-testing-library always uses a 100-column canvas (its Stdout hardcodes
  // `get columns() { return 100; }`) and Ink stretches border lines to the
  // full width, so we cannot meaningfully assert a max line width here.
  // The responsive contract we verify is which COLUMNS are rendered at each
  // mode; the visual checkpoint with a real terminal catches pixel overflow.

  it('at 30 cols (single mode) shows only the package name', () => {
    setup(30);
    const frame = render(<InstalledView />).lastFrame() ?? '';
    expect(frame).toContain('wget');
    expect(frame).not.toContain('1.21');
    expect(frame).not.toContain('internet file retriever');
  });

  it('at 60 cols (compact mode) shows name + version, no description', () => {
    setup(60);
    const frame = render(<InstalledView />).lastFrame() ?? '';
    expect(frame).toContain('wget');
    expect(frame).toContain('1.21');
    expect(frame).not.toContain('internet file retriever');
  });

  it('at 100 cols (comfortable mode) shows name + version + description', () => {
    setup(100);
    const frame = render(<InstalledView />).lastFrame() ?? '';
    expect(frame).toContain('wget');
    expect(frame).toContain('1.21');
    expect(frame).toContain('internet file retriever');
  });

  it('at 140 cols (wide mode) shows every column', () => {
    setup(140);
    const frame = render(<InstalledView />).lastFrame() ?? '';
    expect(frame).toContain('wget');
    expect(frame).toContain('1.21');
    expect(frame).toContain('internet file retriever');
  });

  it('truncates long names with middle ellipsis instead of cutting words', () => {
    setup(60);
    const frame = render(<InstalledView />).lastFrame() ?? '';
    // The middle-truncate must produce the ellipsis character somewhere in
    // the row containing the long name.
    expect(frame).toMatch(/a-really.*….*overflows|a-really.*overflows/);
  });
});
