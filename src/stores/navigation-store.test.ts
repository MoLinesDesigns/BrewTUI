import { beforeEach, describe, expect, it } from 'vitest';
import { useNavigationStore, getNextView, getPrevView, VIEWS, MENU_VIEWS } from './navigation-store.js';

beforeEach(() => {
  useNavigationStore.setState({
    currentView: 'dashboard',
    selectedPackage: null,
    selectedPackageType: null,
    viewHistory: [],
    menuMode: false,
    menuCursor: 0,
  });
});

describe('navigation-store: navigate / goBack', () => {
  it('navigates to a new view and pushes the previous onto history', () => {
    useNavigationStore.getState().navigate('installed');
    const s = useNavigationStore.getState();
    expect(s.currentView).toBe('installed');
    expect(s.viewHistory).toEqual(['dashboard']);
  });

  it('is a no-op when navigating to the current view', () => {
    useNavigationStore.getState().navigate('dashboard');
    const s = useNavigationStore.getState();
    expect(s.currentView).toBe('dashboard');
    expect(s.viewHistory).toEqual([]);
  });

  it('goBack pops the last view from history', () => {
    const { navigate, goBack } = useNavigationStore.getState();
    navigate('installed');
    navigate('outdated');
    goBack();
    const s = useNavigationStore.getState();
    expect(s.currentView).toBe('installed');
    expect(s.viewHistory).toEqual(['dashboard']);
  });

  it('goBack is a no-op when history is empty', () => {
    useNavigationStore.getState().goBack();
    const s = useNavigationStore.getState();
    expect(s.currentView).toBe('dashboard');
    expect(s.viewHistory).toEqual([]);
  });

  it('caps history at 20 entries (drops the oldest)', () => {
    const { navigate } = useNavigationStore.getState();
    // Alternate between two views to push 25 entries onto history.
    for (let i = 0; i < 25; i++) {
      navigate(i % 2 === 0 ? 'installed' : 'outdated');
    }
    expect(useNavigationStore.getState().viewHistory.length).toBeLessThanOrEqual(20);
  });
});

describe('navigation-store: selectPackage', () => {
  it('records package name and type', () => {
    useNavigationStore.getState().selectPackage('wget', 'formula');
    const s = useNavigationStore.getState();
    expect(s.selectedPackage).toBe('wget');
    expect(s.selectedPackageType).toBe('formula');
  });

  it('defaults the type to null', () => {
    useNavigationStore.getState().selectPackage('wget');
    expect(useNavigationStore.getState().selectedPackageType).toBeNull();
  });

  it('clears the selection with null', () => {
    useNavigationStore.getState().selectPackage('wget', 'formula');
    useNavigationStore.getState().selectPackage(null);
    const s = useNavigationStore.getState();
    expect(s.selectedPackage).toBeNull();
    expect(s.selectedPackageType).toBeNull();
  });
});

describe('navigation-store: tab cycle helpers', () => {
  it('VIEWS contains the canonical ordered tab list', () => {
    expect(VIEWS[0]).toBe('dashboard');
    expect(VIEWS).toContain('account');
  });

  it('getNextView wraps from the last entry to the first', () => {
    const last = VIEWS[VIEWS.length - 1]!;
    expect(getNextView(last)).toBe(VIEWS[0]);
  });

  it('getPrevView wraps from the first entry to the last', () => {
    expect(getPrevView(VIEWS[0]!)).toBe(VIEWS[VIEWS.length - 1]);
  });

  it('cycles forward and backward consistently', () => {
    const middle = VIEWS[Math.floor(VIEWS.length / 2)]!;
    expect(getPrevView(getNextView(middle))).toBe(middle);
  });

  // UI-004: 'search' is now in VIEWS so Tab/Shift+Tab cycles through it.
  it('cycles through search like any other view', () => {
    expect(VIEWS).toContain('search');
    const next = getNextView('search');
    expect(VIEWS).toContain(next);
    expect(next).not.toBe('search');
  });
});

describe('navigation-store: menu mode', () => {
  it('enterMenuMode positions cursor at the current view', () => {
    useNavigationStore.setState({ currentView: 'doctor' });
    useNavigationStore.getState().enterMenuMode();
    const s = useNavigationStore.getState();
    expect(s.menuMode).toBe(true);
    expect(MENU_VIEWS[s.menuCursor]).toBe('doctor');
  });

  it('exitMenuMode disables menu mode without navigating', () => {
    useNavigationStore.getState().enterMenuMode();
    useNavigationStore.getState().exitMenuMode();
    const s = useNavigationStore.getState();
    expect(s.menuMode).toBe(false);
    expect(s.currentView).toBe('dashboard');
  });

  it('moveMenuCursor stays within bounds', () => {
    useNavigationStore.setState({ menuMode: true, menuCursor: 0 });
    useNavigationStore.getState().moveMenuCursor(-1);
    expect(useNavigationStore.getState().menuCursor).toBe(0);

    useNavigationStore.setState({ menuMode: true, menuCursor: MENU_VIEWS.length - 1 });
    useNavigationStore.getState().moveMenuCursor(1);
    expect(useNavigationStore.getState().menuCursor).toBe(MENU_VIEWS.length - 1);
  });

  it('selectMenuItem navigates to the cursor view and closes the menu', () => {
    useNavigationStore.setState({ currentView: 'dashboard' });
    useNavigationStore.getState().enterMenuMode();
    const targetIdx = MENU_VIEWS.indexOf('doctor');
    useNavigationStore.setState({ menuCursor: targetIdx });
    useNavigationStore.getState().selectMenuItem();
    const s = useNavigationStore.getState();
    expect(s.menuMode).toBe(false);
    expect(s.currentView).toBe('doctor');
    expect(s.viewHistory).toEqual(['dashboard']);
  });

  it('selectMenuItem on the current view just closes the menu', () => {
    useNavigationStore.setState({ currentView: 'dashboard' });
    useNavigationStore.getState().enterMenuMode();
    useNavigationStore.getState().selectMenuItem();
    const s = useNavigationStore.getState();
    expect(s.menuMode).toBe(false);
    expect(s.currentView).toBe('dashboard');
    expect(s.viewHistory).toEqual([]);
  });

  it('goBack while in menu mode just closes the menu', () => {
    useNavigationStore.setState({ currentView: 'installed', viewHistory: ['dashboard'] });
    useNavigationStore.getState().enterMenuMode();
    useNavigationStore.getState().goBack();
    const s = useNavigationStore.getState();
    expect(s.menuMode).toBe(false);
    expect(s.currentView).toBe('installed');
    expect(s.viewHistory).toEqual(['dashboard']);
  });
});
