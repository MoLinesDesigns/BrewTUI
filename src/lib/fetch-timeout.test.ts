import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
};

vi.mock('../utils/logger.js', () => ({ logger }));

const makeResponse = (status: number, headers?: Record<string, string>) =>
  new Response('', { status, headers });

describe('fetch-timeout', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    logger.debug.mockReset();
    logger.warn.mockReset();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('passes an AbortSignal timeout to fetch', async () => {
    const { fetchWithTimeout } = await import('./fetch-timeout.js');
    const res = makeResponse(200);
    fetchMock.mockResolvedValue(res);

    await expect(fetchWithTimeout('https://example.test', { method: 'POST' }, 123)).resolves.toBe(res);

    expect(fetchMock).toHaveBeenCalledWith('https://example.test', {
      method: 'POST',
      signal: expect.any(AbortSignal),
    });
  });

  it('logs latency for timed async work', async () => {
    const { timed } = await import('./fetch-timeout.js');
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_042);

    await expect(timed('job', async () => 'done')).resolves.toBe('done');

    expect(logger.debug).toHaveBeenCalledWith('job took 42ms');
  });

  it('returns non-retryable 4xx responses immediately', async () => {
    const { fetchWithRetry } = await import('./fetch-timeout.js');
    const res = makeResponse(404);
    fetchMock.mockResolvedValue(res);

    await expect(fetchWithRetry('https://example.test')).resolves.toBe(res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries retryable responses and then returns success', async () => {
    const { fetchWithRetry } = await import('./fetch-timeout.js');
    fetchMock
      .mockResolvedValueOnce(makeResponse(500))
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(200));

    const res = await fetchWithRetry('https://example.test', {}, 10, {
      attempts: 3,
      baseDelayMs: 0,
      maxDelayMs: 0,
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After seconds but caps the delay', async () => {
    vi.useFakeTimers();
    const { fetchWithRetry } = await import('./fetch-timeout.js');
    fetchMock
      .mockResolvedValueOnce(makeResponse(429, { 'retry-after': '10' }))
      .mockResolvedValueOnce(makeResponse(200));

    const promise = fetchWithRetry('https://example.test', {}, 10, {
      attempts: 2,
      baseDelayMs: 1,
      maxDelayMs: 25,
    });

    await vi.advanceTimersByTimeAsync(24);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toHaveProperty('status', 200);
  });

  it('retries transient network errors', async () => {
    const { fetchWithRetry } = await import('./fetch-timeout.js');
    fetchMock
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(makeResponse(200));

    await expect(fetchWithRetry('https://example.test', {}, 10, {
      attempts: 2,
      baseDelayMs: 0,
      maxDelayMs: 0,
    })).resolves.toHaveProperty('status', 200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient errors', async () => {
    const { fetchWithRetry } = await import('./fetch-timeout.js');
    fetchMock.mockRejectedValue(new Error('schema mismatch'));

    await expect(fetchWithRetry('https://example.test', {}, 10, {
      attempts: 3,
      baseDelayMs: 0,
      maxDelayMs: 0,
    })).rejects.toThrow('schema mismatch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
