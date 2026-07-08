import type { BrewSnapshot } from '../state-snapshot/snapshot.js';
import type { BrewfileSchema } from '../brewfile/types.js';

export interface SyncConfig {
  enabled: boolean;
  machineId: string;
  machineName: string;
  lastSync?: string; // ISO 8601
}

export interface MachineState {
  machineId: string;
  machineName: string;
  updatedAt: string;       // ISO 8601
  snapshot: BrewSnapshot;
  brewfile?: BrewfileSchema;
}

export interface SyncPayload {
  machines: Record<string, MachineState>;
}

// BK-008: type guard for sync envelopes after AES-GCM decrypt. Defends against
// truncated or migrated payloads landing as undefined accesses downstream.
export function isSyncPayload(value: unknown): value is SyncPayload {
  if (typeof value !== 'object' || value === null) return false;
  const machines = (value as Record<string, unknown>).machines;
  if (typeof machines !== 'object' || machines === null || Array.isArray(machines)) return false;
  for (const m of Object.values(machines as Record<string, unknown>)) {
    if (typeof m !== 'object' || m === null) return false;
    const state = m as Record<string, unknown>;
    if (
      typeof state.machineId !== 'string' ||
      typeof state.machineName !== 'string' ||
      typeof state.updatedAt !== 'string' ||
      typeof state.snapshot !== 'object'
    ) {
      return false;
    }
  }
  return true;
}

export interface SyncEnvelope {
  schemaVersion: 1;
  encrypted: string;
  iv: string;
  tag: string;
  updatedAt: string; // ISO 8601 — plaintext for BrewTUI-Bar monitoring
}

// BK-006: 'merge-union' aparecia en este union pero applyConflictResolutions()
// nunca implemento la rama; cualquier caller que lo pasara veia el conflicto
// descartado silenciosamente. Eliminado hasta que exista la logica de merge.
export type ConflictResolution = 'use-local' | 'use-remote';

export interface SyncConflict {
  packageName: string;
  packageType: 'formula' | 'cask';
  localVersion: string;
  remoteMachine: string;
  remoteVersion: string;
}

export interface SyncResult {
  success: boolean;
  conflicts: SyncConflict[];
  resolvedCount: number;
  error?: string;
}
