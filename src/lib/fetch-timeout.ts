import { logger } from '../utils/logger.js';

export function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Wrap an async function with debug-level latency logging.
 */
export function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  return fn().finally(() => logger.debug(`${label} took ${Date.now() - start}ms`));
}

interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (response: Response) => boolean;
}

const DEFAULT_RETRY: Required<Omit<RetryOptions, 'retryOn'>> & Pick<RetryOptions, 'retryOn'> = {
  attempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4_000,
  // BK-004: 429 (rate limit) tambien es transitorio. Reintentamos respetando
  // `Retry-After` cuando esta presente (se gestiona en el bucle inferior).
  retryOn: (res) => res.status === 429 || (res.status >= 500 && res.status < 600),
};

// BK-004: parse del header `Retry-After`. RFC 7231: o bien segundos (entero) o
// un HTTP-date. Devuelve milisegundos o null si no se puede interpretar.
function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000);
  const ts = Date.parse(raw);
  if (Number.isFinite(ts)) {
    const delta = ts - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}

function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|timeout|abort|EAI_AGAIN/i.test(msg);
}

/**
 * fetchWithTimeout + retry with exponential backoff. Retries only on transient
 * network errors and on responses matching `retryOn` (default: 5xx). 4xx
 * responses are returned to the caller without retry.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
  retry: RetryOptions = {},
): Promise<Response> {
  const cfg = { ...DEFAULT_RETRY, ...retry };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
      if (attempt < cfg.attempts && cfg.retryOn?.(res)) {
        // BK-004: si el servidor indica `Retry-After` (tipico en 429), usar
        // ese hint en lugar del backoff exponencial. Cap al maxDelay para no
        // congelar al usuario indefinidamente si el servidor pide minutos.
        const retryAfter = parseRetryAfter(res);
        const backoff = Math.min(cfg.baseDelayMs * Math.pow(2, attempt - 1), cfg.maxDelayMs);
        const delay = retryAfter !== null ? Math.min(retryAfter, cfg.maxDelayMs) : backoff;
        logger.warn(`fetchWithRetry: ${url} returned ${res.status}, retry ${attempt}/${cfg.attempts - 1} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt >= cfg.attempts || !isTransientNetworkError(err)) throw err;
      const delay = Math.min(cfg.baseDelayMs * Math.pow(2, attempt - 1), cfg.maxDelayMs);
      logger.warn(`fetchWithRetry: ${url} threw transient error, retry ${attempt}/${cfg.attempts - 1} in ${delay}ms`, { error: String(err) });
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
