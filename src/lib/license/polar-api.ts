import { createHash } from 'node:crypto';
import type { PolarActivateResponse, PolarValidateResponse } from './types.js';
import { fetchWithRetry } from '../fetch-timeout.js';
import { getMachineId } from '../data-dir.js';

// BK-009: hash truncado SHA-256 del machineId — opacidad adicional frente a
// correlacion en logs de Polar. El servidor solo necesita un identificador
// estable por equipo; no requiere el UUID en claro.
function hashMachineLabel(machineId: string): string {
  return createHash('sha256').update(machineId).digest('hex').slice(0, 32);
}

const BASE_URL = 'https://api.polar.sh/v1/customer-portal/license-keys';

// ── GOV-004: Public organization ID (not a secret) ──
// This is the public Polar organization identifier used for license key operations.
// Found at: polar.sh/dashboard -> Settings -> General
export const POLAR_ORGANIZATION_ID = 'b8f245c0-d116-4457-92fb-1bda47139f82';

// Polar product IDs (public, not secret) — useful for analytics, support, and
// future server-side validation that wants to confirm what the customer bought.
export const POLAR_PRODUCT_IDS = {
  proMonthly:  'b925b882-464c-40c1-9ffd-b088ab31d9a3',
  proYearly:   '8f97bb81-b950-4bc3-97c5-8133dd817d0b',
  teamMonthly: '7cf3fcb2-560d-4fbb-9936-15efac511b23',
  teamYearly:  'd096914d-902d-47b0-8d62-5c7e6fc4e087',
} as const;

// Public checkout URLs surfaced from the landing page and the CLI upgrade prompt.
// Team links carry ?quantity=3 because Polar has no native min-seats enforcement
// and the Team tier is sold from 3 seats up.
export const POLAR_CHECKOUT_URLS = {
  proMonthly:  'https://buy.polar.sh/polar_cl_QW1ZJ9887bU74drGr7JfujQfm3RKYnn1fuvc53DqD6D',
  proYearly:   'https://buy.polar.sh/polar_cl_yQsiUeDelyyEQznbWffD1j77JAyP24ra7iEVQ22PA4h',
  teamMonthly: 'https://buy.polar.sh/polar_cl_CO6xqSzKgFiQJwXnhZYGqisOP04Wspi0KKZSn38NjFZ?quantity=3',
  teamYearly:  'https://buy.polar.sh/polar_cl_BZowqmtaKwWEkRJNtBcashWg7oZOH6OhnnsJ204opNA?quantity=3',
} as const;

// Layer 11: API URL validation
function validateApiUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('HTTPS required for license API');
  }
  // SEC-M1: `endsWith('polar.sh')` would let `evilpolar.sh` pass. Match the
  // exact apex OR a true subdomain via the leading-dot variant.
  if (parsed.hostname !== 'polar.sh' && !parsed.hostname.endsWith('.polar.sh')) {
    throw new Error('Invalid API host');
  }
}

// Raw Polar response shapes
interface PolarActivation {
  id: string; // activation_id
  license_key: {
    status: string;
    expires_at: string | null;
  };
}

interface PolarValidated {
  id: string;
  status: string; // 'granted' | 'revoked' | 'disabled'
  expires_at: string | null;
  customer: {
    email: string | null;
    name: string | null;
  };
  activation: { id: string } | null;
}

async function post<T>(endpoint: string, body: Record<string, unknown>, expectEmpty = false): Promise<T> {
  // BK-008: Polar requiere trailing slash en sus rutas. Sin la barra final el
  // servidor responde 307 y `fetch` con redirect followed pierde la cabecera
  // Authorization → 405. Aseguramos la barra final aqui para que el caller
  // pueda seguir usando rutas semanticas sin recordar la convencion.
  const url = `${BASE_URL}/${endpoint}/`;
  validateApiUrl(url);

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 15_000);

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const errBody = await res.json() as { detail?: string; error?: string; message?: string };
      if (typeof errBody.detail === 'string') message = errBody.detail;
      else if (typeof errBody.error === 'string') message = errBody.error;
      else if (typeof errBody.message === 'string') message = errBody.message;
    } catch {
      // non-JSON error body — use generic message above
    }
    throw new Error(message);
  }

  if (expectEmpty || res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function activateLicense(key: string): Promise<PolarActivateResponse> {
  const machineId = await getMachineId();

  const activation = await post<PolarActivation>('activate', {
    key,
    organization_id: POLAR_ORGANIZATION_ID,
    // SEG-004 + BK-009: identificador estable por equipo, hasheado para
    // que el UUID en claro no aparezca en logs de Polar.
    label: hashMachineLabel(machineId),
  });

  // EP-001: Runtime validation of activation response
  if (!activation || typeof activation.id !== 'string' || !activation.license_key) {
    throw new Error('Invalid activation response: missing required fields');
  }

  // Polar's activate response doesn't include customer info — fetch it via validate
  let customerEmail = '';
  let customerName = '';
  try {
    const validated = await post<PolarValidated>('validate', {
      key,
      organization_id: POLAR_ORGANIZATION_ID,
      activation_id: activation.id,
    });
    customerEmail = validated.customer?.email ?? '';
    customerName = validated.customer?.name ?? '';
  } catch {
    // customer info is non-critical — activation still succeeds
  }

  return {
    activated: true,
    error: null,
    instance: { id: activation.id },
    license_key: {
      id: 0,
      status: activation.license_key.status,
      key,
      activation_limit: 0,
      activations_count: 0,
      expires_at: activation.license_key.expires_at,
    },
    meta: { customer_email: customerEmail, customer_name: customerName },
  };
}

export async function validateLicense(key: string, instanceId: string): Promise<PolarValidateResponse> {
  const res = await post<PolarValidated>('validate', {
    key,
    organization_id: POLAR_ORGANIZATION_ID,
    activation_id: instanceId,
  });

  // EP-002: Runtime validation of validate response
  if (!res || typeof res.id !== 'string' || typeof res.status !== 'string' || !res.customer) {
    throw new Error('Invalid validation response: missing required fields');
  }

  const notExpired = res.expires_at === null || new Date(res.expires_at) > new Date();
  const valid = res.status === 'granted' && notExpired;

  return {
    valid,
    error: valid ? null : `License ${res.status}`,
    license_key: {
      id: 0,
      status: res.status,
      key,
      expires_at: res.expires_at,
    },
    instance: { id: instanceId },
  };
}

export async function deactivateLicense(key: string, instanceId: string): Promise<void> {
  await post<void>(
    'deactivate',
    { key, organization_id: POLAR_ORGANIZATION_ID, activation_id: instanceId },
    true,
  );
}
