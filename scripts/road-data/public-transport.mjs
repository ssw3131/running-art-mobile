import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// One gate shared by all verification workers. r2.dev has a variable request
// limit, so bounding concurrent requests alone does not bound requests/second.
export function createPacedPublicFetch({ fetchImpl = fetch, intervalMs = 20,
  retryDelayMs = 10000, retries = 3, now = Date.now, sleep = delay, onThrottle } = {}) {
  assert.ok(Number.isFinite(intervalMs) && intervalMs > 0);
  assert.ok(Number.isFinite(retryDelayMs) && retryDelayMs > 0);
  assert.ok(Number.isInteger(retries) && retries >= 0 && retries <= 3);
  let queue = Promise.resolve(), nextRequestAt = 0, blockedUntil = 0, stopped;
  async function request(url, init) {
    let response;
    const turn = queue.then(async () => {
      if (stopped) throw stopped;
      while (Math.max(nextRequestAt, blockedUntil) > now()) {
        await sleep(Math.max(nextRequestAt, blockedUntil) - now());
        if (stopped) throw stopped;
      }
      if (init?.signal?.aborted) throw init.signal.reason;
      nextRequestAt = now() + intervalMs;
      const deadline = AbortSignal.timeout(30000);
      response = fetchImpl(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
    });
    queue = turn.catch(() => {});
    await turn;
    return response;
  }
  return async (url, init) => {
    for (let attempt = 0; ; attempt++) {
      if (init?.signal?.aborted) throw init.signal.reason;
      const response = await request(url, init);
      if (response.status !== 429) return response;
      const retryAfter = response.headers.get('retry-after');
      const advertised = retryAfter === null ? 0 : /^\d+$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - now());
      const waitMs = Math.max(retryDelayMs * 2 ** attempt, Number.isNaN(advertised) ? 0 : advertised);
      await response.body?.cancel();
      // A long server-directed pause is reported for an explicit later retry;
      // never shorten Retry-After to fit the bounded automatic retry window.
      if (attempt >= retries || waitMs > 60000) {
        stopped = new Error(`HTTP 429: 공개 검증 재시도 중단 (Retry-After: ${retryAfter ?? 'none'})`);
        throw stopped;
      }
      blockedUntil = Math.max(blockedUntil, now() + waitMs);
      onThrottle?.({ attempt: attempt + 1, waitMs, url: String(url) });
    }
  };
}
