import { create } from 'zustand';
import type { Formula, Cask, OutdatedPackage, BrewService, BrewConfig } from '../lib/types.js';
import * as api from '../lib/brew-api.js';
import { logger } from '../utils/logger.js';

const BREW_UPDATE_COOLDOWN_MS = 5 * 60 * 1000;

let fetchAllInFlight: Promise<void> | null = null;
let brewUpdateInFlight: Promise<void> | null = null;
let lastBrewUpdateStartedAt = 0;

interface BrewState {
  formulae: Formula[];
  casks: Cask[];
  outdated: { formulae: OutdatedPackage[]; casks: OutdatedPackage[] };
  services: BrewService[];
  config: BrewConfig | null;
  leaves: string[];
  doctorWarnings: string[];
  doctorClean: boolean | null;

  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  lastFetchedAt: Record<string, number>;

  fetchInstalled: () => Promise<void>;
  fetchOutdated: () => Promise<void>;
  fetchServices: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchLeaves: () => Promise<void>;
  fetchDoctor: () => Promise<void>;
  fetchAll: () => Promise<void>;

  uninstallPackage: (name: string) => Promise<void>;
  serviceAction: (name: string, action: 'start' | 'stop' | 'restart') => Promise<void>;
}

function setLoading(set: (fn: (s: BrewState) => Partial<BrewState>) => void, key: string, value: boolean) {
  set((s) => ({ loading: { ...s.loading, [key]: value } }));
}

function setError(set: (fn: (s: BrewState) => Partial<BrewState>) => void, key: string, error: string | null) {
  set((s) => ({ errors: { ...s.errors, [key]: error } }));
}

function recordFetchTime(set: (fn: (s: BrewState) => Partial<BrewState>) => void, key: string) {
  set((s) => ({ lastFetchedAt: { ...s.lastFetchedAt, [key]: Date.now() } }));
}

/** Refreshes the Homebrew tap index before `brew outdated` so results match the terminal. */
async function ensureBrewIndexFresh(
  set: (fn: (s: BrewState) => Partial<BrewState>) => void,
): Promise<void> {
  const now = Date.now();
  if (brewUpdateInFlight) {
    await brewUpdateInFlight;
    return;
  }
  if (now - lastBrewUpdateStartedAt <= BREW_UPDATE_COOLDOWN_MS) {
    return;
  }
  lastBrewUpdateStartedAt = now;
  brewUpdateInFlight = api.brewUpdate()
    .catch((err) => { set((s) => ({ errors: { ...s.errors, update: String(err) } })); })
    .finally(() => {
      brewUpdateInFlight = null;
    });
  await brewUpdateInFlight;
}

export const useBrewStore = create<BrewState>((set, get) => ({
  formulae: [],
  casks: [],
  outdated: { formulae: [], casks: [] },
  services: [],
  config: null,
  leaves: [],
  doctorWarnings: [],
  doctorClean: null,
  // Pre-initialize loading flags for keys that fetchAll always triggers so
  // views that check loading.X get a spinner on first render rather than
  // flashing empty/zeroed content for one frame before the fetch starts.
  // SCR-013: Pre-initialize doctor loading to true
  loading: { installed: true, outdated: true, services: true, config: true, doctor: true },
  errors: {},
  lastFetchedAt: {},

  fetchInstalled: async () => {
    setLoading(set, 'installed', true);
    setError(set, 'installed', null);
    try {
      const result = await api.getInstalled();
      set({ formulae: result.formulae, casks: result.casks });
    } catch (err) {
      setError(set, 'installed', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(set, 'installed', false);
      recordFetchTime(set, 'installed');
    }
  },

  fetchOutdated: async () => {
    setLoading(set, 'outdated', true);
    setError(set, 'outdated', null);
    try {
      await ensureBrewIndexFresh(set);
      const result = await api.getOutdated();
      set({ outdated: result });
    } catch (err) {
      setError(set, 'outdated', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(set, 'outdated', false);
      recordFetchTime(set, 'outdated');
    }
  },

  fetchServices: async () => {
    setLoading(set, 'services', true);
    setError(set, 'services', null);
    try {
      const result = await api.getServices();
      set({ services: result });
    } catch (err) {
      setError(set, 'services', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(set, 'services', false);
      recordFetchTime(set, 'services');
    }
  },

  fetchConfig: async () => {
    setLoading(set, 'config', true);
    try {
      const result = await api.getConfig();
      set({ config: result });
    } catch (err) {
      setError(set, 'config', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(set, 'config', false);
      recordFetchTime(set, 'config');
    }
  },

  fetchLeaves: async () => {
    try {
      const result = await api.getLeaves();
      set({ leaves: result });
    } catch (err) {
      // QA-021: Use structured logger unconditionally
      logger.error('fetchLeaves failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      recordFetchTime(set, 'leaves');
    }
  },

  fetchDoctor: async () => {
    setLoading(set, 'doctor', true);
    setError(set, 'doctor', null);
    try {
      const result = await api.getDoctor();
      set({ doctorWarnings: result.warnings, doctorClean: result.isClean });
    } catch (err) {
      setError(set, 'doctor', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(set, 'doctor', false);
      recordFetchTime(set, 'doctor');
    }
  },

  fetchAll: async (): Promise<void> => {
    if (fetchAllInFlight) {
      return fetchAllInFlight;
    }

    // Claim the in-flight slot before any await so concurrent fetchAll()
    // callers dedupe instead of racing through ensureBrewIndexFresh.
    fetchAllInFlight = (async () => {
      await ensureBrewIndexFresh(set);
      const store = get();
      // PERF: keep fetchAll to the data Dashboard renders on the first frame.
      // `brew doctor` (~4 s) and `brew leaves` (~1 s) were here historically
      // but Dashboard reads neither — `doctorWarnings/doctorClean` is only
      // consumed by `views/doctor.tsx` (lazy-fetched in its own useEffect),
      // and `leaves` had no in-store consumer at all. Moving them out drops
      // cold-start time from ~5 s to <1 s (dominated now by `brew config`
      // at ~0.9 s). If a future view starts reading either from the store,
      // restore its `fetchX()` call here or lazy-fetch from that view.
      await Promise.all([
        store.fetchInstalled(),
        store.fetchOutdated(),
        store.fetchServices(),
        store.fetchConfig(),
      ]);
    })().finally(() => {
      fetchAllInFlight = null;
    });

    return fetchAllInFlight;
  },

  uninstallPackage: async (name) => {
    setLoading(set, 'action', true);
    try {
      await api.uninstallPackage(name);
      await get().fetchInstalled();
    } catch (err) {
      setError(set, 'action', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(set, 'action', false);
    }
  },

  serviceAction: async (name, action) => {
    setLoading(set, 'service-action', true);
    try {
      await api.serviceAction(name, action);
      await get().fetchServices();
    } catch (err) {
      setError(set, 'service-action', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(set, 'service-action', false);
    }
  },
}));
