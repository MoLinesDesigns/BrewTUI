import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DATA_DIR, ensureDataDirs, getMachineId } from '../data-dir.js';
// BK-003: usar fetchWithRetry — un 5xx transitorio o un 429 en validate/redeem
// invalidaba antes el canje sin reintento. La capa de retry ya respeta
// Retry-After y backoff exponencial.
import { fetchWithRetry } from '../fetch-timeout.js';
import { logger } from '../../utils/logger.js';

const PROMO_PATH = join(DATA_DIR, 'promo.json');

// Promo API endpoint (self-hosted or Polar webhook)
const PROMO_API_URL = 'https://api.molinesdesigns.com/api/promo';

// BK-015: validate the promo URL before fetch — same defensive guardrail
// the polar-api.ts path has had since SEG-001. Reject any non-HTTPS or any
// host that isn't on the molinesdesigns.com domain.
function validatePromoApiUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('HTTPS required for promo API');
  }
  if (!parsed.hostname.endsWith('molinesdesigns.com')) {
    throw new Error('Invalid promo API host');
  }
}

export interface PromoCode {
  code: string;
  type: 'trial' | 'discount' | 'full';
  durationDays: number;
  maxRedemptions: number;
  currentRedemptions: number;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
}

interface PromoRedemption {
  code: string;
  redeemedAt: string;
  expiresAt: string;
  type: 'trial' | 'discount' | 'full';
}

interface PromoFile {
  version: 1;
  redemptions: PromoRedemption[];
}

// ── Generate promo codes (admin/CLI use) ──

export function generatePromoCode(prefix = 'BREW'): string {
  const random = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${random.slice(0, 4)}-${random.slice(4, 8)}`;
}

export function generatePromoBatch(count: number, options: {
  type: 'trial' | 'discount' | 'full';
  durationDays: number;
  maxRedemptions: number;
  expiresAt?: string | null;
  prefix?: string;
}): PromoCode[] {
  const codes: PromoCode[] = [];
  for (let i = 0; i < count; i++) {
    codes.push({
      code: generatePromoCode(options.prefix),
      type: options.type,
      durationDays: options.durationDays,
      maxRedemptions: options.maxRedemptions,
      currentRedemptions: 0,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt ?? null,
      active: true,
    });
  }
  return codes;
}

// ── Validate promo code against API ──

export async function validatePromoCode(code: string): Promise<{
  valid: boolean;
  type?: 'trial' | 'discount' | 'full';
  durationDays?: number;
  error?: string;
}> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length < 8) {
    return { valid: false, error: 'Invalid promo code format' };
  }

  validatePromoApiUrl(`${PROMO_API_URL}/validate`);
  try {
    const res = await fetchWithRetry(`${PROMO_API_URL}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: normalized }),
    }, 10_000);

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      return { valid: false, error: body.error ?? 'Invalid or expired promo code' };
    }

    const data = await res.json() as unknown;
    if (
      !data || typeof data !== 'object' ||
      typeof (data as { type?: unknown }).type !== 'string' ||
      typeof (data as { durationDays?: unknown }).durationDays !== 'number'
    ) {
      return { valid: false, error: 'Unexpected promo validation response' };
    }
    const { type, durationDays } = data as { type: string; durationDays: number };
    if (type !== 'trial' && type !== 'discount' && type !== 'full') {
      return { valid: false, error: 'Unsupported promo type' };
    }
    return {
      valid: true,
      type,
      durationDays,
    };
  } catch (err) {
    logger.error('Promo validation failed', { error: String(err) });
    return { valid: false, error: 'Could not validate promo code. Check your connection.' };
  }
}

// ── Redeem promo code locally ──

export async function redeemPromoCode(code: string): Promise<{
  success: boolean;
  expiresAt?: string;
  error?: string;
}> {
  const normalized = code.trim().toUpperCase();
  const machineId = await getMachineId();

  // Call backend to validate + redeem in one step
  validatePromoApiUrl(`${PROMO_API_URL}/redeem`);
  let serverExpiresAt: string;
  let serverType: 'trial' | 'discount' | 'full';
  // EP-002: idempotency key — accidental double-clicks or retries on a flaky
  // network must not consume the promo twice. The backend dedupes on this.
  const idempotencyKey = randomUUID();
  try {
    const res = await fetchWithRetry(`${PROMO_API_URL}/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ code: normalized, machineId, idempotencyKey }),
    }, 10_000);

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      return { success: false, error: body.error ?? 'Invalid or expired promo code' };
    }

    const data = await res.json() as unknown;
    const inner = (data as { data?: unknown })?.data;
    if (
      !inner || typeof inner !== 'object' ||
      typeof (inner as { expiresAt?: unknown }).expiresAt !== 'string' ||
      typeof (inner as { type?: unknown }).type !== 'string'
    ) {
      return { success: false, error: 'Unexpected promo redeem response' };
    }
    const expiresAt = (inner as { expiresAt: string }).expiresAt;
    const type = (inner as { type: string }).type;
    if (type !== 'trial' && type !== 'discount' && type !== 'full') {
      return { success: false, error: 'Unsupported promo type' };
    }
    serverExpiresAt = expiresAt;
    serverType = type;
  } catch (err) {
    logger.error('Promo redeem failed', { error: String(err) });
    return { success: false, error: 'Could not reach promo server. Check your connection.' };
  }

  // Save locally as well
  await ensureDataDirs();

  const redemption: PromoRedemption = {
    code: normalized,
    redeemedAt: new Date().toISOString(),
    expiresAt: serverExpiresAt,
    type: serverType,
  };

  let file: PromoFile = { version: 1, redemptions: [] };
  try {
    const raw = await readFile(PROMO_PATH, 'utf-8');
    file = JSON.parse(raw) as PromoFile;
  } catch { /* no existing file */ }

  // Check for duplicate redemption
  if (file.redemptions.some((r) => r.code === redemption.code)) {
    return { success: false, error: 'This promo code has already been redeemed' };
  }

  file.redemptions.push(redemption);

  // Atomic write
  const tmpPath = PROMO_PATH + '.tmp';
  await writeFile(tmpPath, JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await rename(tmpPath, PROMO_PATH);

  return { success: true, expiresAt: redemption.expiresAt };
}

// ── Check if an active promo is in effect ──

export async function getActivePromo(): Promise<PromoRedemption | null> {
  try {
    const raw = await readFile(PROMO_PATH, 'utf-8');
    const file = JSON.parse(raw) as PromoFile;
    const now = Date.now();

    // Find the most recent non-expired redemption
    const active = file.redemptions
      .filter((r) => new Date(r.expiresAt).getTime() > now)
      .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];

    return active ?? null;
  } catch {
    return null;
  }
}
