import { create } from 'zustand';
import type { LicenseData, LicenseStatus } from '../lib/license/types.js';
import * as manager from '../lib/license/license-manager.js';
import { getDegradationLevel } from '../lib/license/license-manager.js';
import type { DegradationLevel } from '../lib/license/license-manager.js';
import { ensureDataDirs } from '../lib/data-dir.js';
import { initStoreIntegrity } from '../lib/license/anti-tamper.js';

const REVALIDATION_CHECK_MS = 60 * 60 * 1000; // Check every hour

// ARQ-002: Promise-based mutex for revalidation
let _revalidatingPromise: Promise<void> | null = null;
let _revalidationInterval: ReturnType<typeof setInterval> | null = null;

interface LicenseState {
  status: LicenseStatus;
  license: LicenseData | null;
  error: string | null;
  degradation: DegradationLevel;

  initialize: () => Promise<void>;
  activate: (key: string) => Promise<boolean>;
  deactivate: () => Promise<void>;
  revalidate: () => Promise<void>;
  isPro: () => boolean;
  isTeam: () => boolean;
}

async function doRevalidation(
  license: LicenseData,
  set: (partial: Partial<LicenseState>) => void,
): Promise<void> {
  const result = await manager.revalidate(license);
  if (result === 'expired') {
    set({ status: 'expired', license: { ...license, status: 'expired' }, degradation: 'expired' });
    return;
  }
  const updated = await manager.loadLicense();
  const effective = updated ?? license;
  set({
    status: effective.plan,
    license: effective,
    degradation: getDegradationLevel(effective),
  });
}

export const useLicenseStore = create<LicenseState>((set, get) => ({
  status: 'validating',
  license: null,
  error: null,
  degradation: 'none',

  initialize: async () => {
    initStoreIntegrity(useLicenseStore);
    await ensureDataDirs();
    let license = await manager.loadLicense();

    if (!license) {
      set({ status: 'free', license: null, degradation: 'none' });
      return;
    }

    // SEG-009: built-in perennial accounts removed; every license — including
    // operator/admin — is validated against Polar like a normal customer.

    // Attempt online refresh before denying Pro — stale lastValidatedAt (30+ days
    // offline) or benign clock skew should self-heal when the API is reachable.
    const shouldTryRevalidation =
      manager.needsRevalidation(license) || getDegradationLevel(license) === 'expired';

    if (shouldTryRevalidation) {
      if (!_revalidatingPromise) {
        _revalidatingPromise = doRevalidation(license, set)
          .finally(() => { _revalidatingPromise = null; });
      }
      await _revalidatingPromise;
      if (get().status === 'expired') return;
      license = get().license ?? (await manager.loadLicense()) ?? license;
    }

    if (manager.isExpired(license)) {
      set({ status: 'expired', license, degradation: 'expired' });
      return;
    }

    const level = getDegradationLevel(license);
    if (level === 'expired') {
      set({ status: 'expired', license, degradation: 'expired' });
      return;
    }

    set({ status: license.plan, license, degradation: level });

    // Periodically re-check license validity during the session
    if (_revalidationInterval) clearInterval(_revalidationInterval);
    _revalidationInterval = setInterval(() => {
      const current = get().license;
      const status = get().status;
      if (!current || (status !== 'pro' && status !== 'team')) return;
      if (!manager.needsRevalidation(current)) return;
      if (_revalidatingPromise) return;
      _revalidatingPromise = doRevalidation(current, set)
        .finally(() => { _revalidatingPromise = null; });
    }, REVALIDATION_CHECK_MS);
    _revalidationInterval.unref();
  },

  activate: async (key) => {
    set({ error: null });
    try {
      const license = await manager.activate(key);
      set({ status: license.plan, license, degradation: 'none' });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      return false;
    }
  },

  deactivate: async () => {
    const { license } = get();
    if (license) {
      const { remoteSuccess } = await manager.deactivate(license);
      if (!remoteSuccess) {
        set({ status: 'free', license: null, degradation: 'none', error: 'License removed locally but server deactivation failed. It may remain active remotely.' });
        return;
      }
    }
    set({ status: 'free', license: null, degradation: 'none', error: null });
  },

  revalidate: async () => {
    const { license } = get();
    if (!license) return;
    try {
      await doRevalidation(license, set);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  // Team is a superset of Pro — team users have full Pro access plus team features.
  // Pro users do NOT get Team features (Compliance) without paying for the Team tier.
  isPro: () => { const s = get().status; return s === 'pro' || s === 'team'; },
  isTeam: () => get().status === 'team',
}));
