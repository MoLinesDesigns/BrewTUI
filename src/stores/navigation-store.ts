import { create } from 'zustand';
import type { ViewId } from '../lib/types.js';

interface NavigationState {
  currentView: ViewId;
  selectedPackage: string | null;
  selectedPackageType: 'formula' | 'cask' | null;
  viewHistory: ViewId[];
  menuMode: boolean;
  menuCursor: number;
  navigate: (view: ViewId) => void;
  goBack: () => void;
  selectPackage: (name: string | null, type?: 'formula' | 'cask' | null) => void;
  enterMenuMode: () => void;
  exitMenuMode: () => void;
  moveMenuCursor: (delta: 1 | -1) => void;
  selectMenuItem: () => void;
}

const VIEWS: ViewId[] = [
  'dashboard', 'installed', 'outdated', 'package-info', 'search', 'services', 'doctor',
  'profiles', 'smart-cleanup', 'history', 'rollback', 'brewfile', 'sync', 'security-audit', 'compliance', 'account',
];

// MENU_VIEWS is the ordered list rendered in the side menu. Excludes `search`
// (contextual entry via S) but keeps `package-info` because the header shows it.
// menuCursor indexes into this list.
const MENU_VIEWS: ViewId[] = [
  'dashboard', 'installed', 'outdated', 'package-info', 'services', 'doctor',
  'profiles', 'smart-cleanup', 'history', 'rollback', 'brewfile', 'sync', 'security-audit', 'compliance', 'account',
];

export const useNavigationStore = create<NavigationState>((set, get) => ({
  currentView: 'dashboard',
  selectedPackage: null,
  selectedPackageType: null,
  viewHistory: [],
  // menuMode starts ON so the side menu owns arrows from the first frame —
  // users can navigate with ↑/↓/↵ without having to press M first.
  menuMode: true,
  menuCursor: 0,

  navigate: (view) => {
    const { currentView, viewHistory } = get();
    if (view === currentView) return;
    set({
      currentView: view,
      viewHistory: [...viewHistory.slice(-19), currentView],
    });
  },

  goBack: () => {
    const { viewHistory, menuMode } = get();
    if (menuMode) {
      set({ menuMode: false });
      return;
    }
    if (viewHistory.length === 0) return;
    const prev = viewHistory[viewHistory.length - 1];
    set({
      currentView: prev,
      viewHistory: viewHistory.slice(0, -1),
    });
  },

  selectPackage: (name, type = null) => set({ selectedPackage: name, selectedPackageType: type }),

  enterMenuMode: () => {
    const { currentView } = get();
    const idx = MENU_VIEWS.indexOf(currentView);
    set({ menuMode: true, menuCursor: idx >= 0 ? idx : 0 });
  },

  exitMenuMode: () => set({ menuMode: false }),

  moveMenuCursor: (delta) => {
    const { menuCursor } = get();
    const next = menuCursor + delta;
    if (next < 0 || next >= MENU_VIEWS.length) return;
    set({ menuCursor: next });
  },

  selectMenuItem: () => {
    const { menuCursor, currentView, viewHistory } = get();
    const target = MENU_VIEWS[menuCursor];
    if (!target) {
      set({ menuMode: false });
      return;
    }
    if (target === currentView) {
      set({ menuMode: false });
      return;
    }
    set({
      currentView: target,
      viewHistory: [...viewHistory.slice(-19), currentView],
      menuMode: false,
    });
  },
}));

export function getNextView(current: ViewId): ViewId {
  const idx = VIEWS.indexOf(current);
  return VIEWS[(idx + 1) % VIEWS.length]!;
}

export function getPrevView(current: ViewId): ViewId {
  const idx = VIEWS.indexOf(current);
  return VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length]!;
}

export { VIEWS, MENU_VIEWS };
