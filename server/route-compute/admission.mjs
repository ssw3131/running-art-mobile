import { ServiceError } from './pool.mjs';

export const DEFAULT_LIMITS = Object.freeze({ minute: 6, hour: 60, day: 200, month: 3000 });
const periods = ['minute', 'hour', 'day', 'month'];

export function emptyAdmissionState() {
  return { version: 1, paused: false, lastMs: 0, windows: {} };
}

function validateState(state) {
  if (!state || state.version !== 1 || typeof state.paused !== 'boolean' ||
      !Number.isSafeInteger(state.lastMs) || state.lastMs < 0 || !state.windows ||
      typeof state.windows !== 'object' || Array.isArray(state.windows)) throw new Error('invalid_admission_state');
  for (const period of periods) {
    const item = state.windows[period];
    if (!item && state.lastMs !== 0) throw new Error('missing_admission_window');
    if (item && (!Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end) ||
        item.start < 0 || item.end <= item.start || !Number.isSafeInteger(item.count) || item.count < 0)) {
      throw new Error('invalid_admission_window');
    }
    if (item) {
      const expected = windowAt(period, state.lastMs);
      if (item.start !== expected.start || item.end !== expected.end) throw new Error('inconsistent_admission_window');
    }
  }
}

function windowAt(period, now) {
  const duration = { minute: 60000, hour: 3600000, day: 86400000 }[period];
  if (duration) {
    const start = Math.floor(now / duration) * duration;
    return { start, end: start + duration, count: 0 };
  }
  const date = new Date(now), year = date.getUTCFullYear(), month = date.getUTCMonth();
  return { start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1), count: 0 };
}

function rejected(code, retryAfter, status = 429) {
  const error = new ServiceError(status, code);
  error.retryAfter = Math.max(1, Math.ceil(retryAfter));
  return error;
}

// No caller-controlled identity is trusted. All anonymous clients, revisions and
// instances share these infrastructure limits. Count reservations before work;
// cancellations and failures still consumed resources and are never refunded.
export function createAdmissionGuard({ store, limits = DEFAULT_LIMITS, now = Date.now, cooldownMs = 30000 }) {
  for (const key of periods) if (!Number.isSafeInteger(limits[key]) || limits[key] < 1) throw new Error('invalid_admission_limit');
  let blockedUntil = 0, retryUntil = 0, blockedError;
  const block = (error, until) => { blockedError = error; blockedUntil = until; retryUntil = now() + error.retryAfter * 1000; throw error; };
  return {
    async reserve(signal) {
      if (signal.aborted) throw new ServiceError(499, 'cancelled');
      if (now() < blockedUntil) throw rejected(blockedError.code, (retryUntil - now()) / 1000, blockedError.status);
      // A bounded CAS retry avoids a second distributed queue under contention.
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          let snapshot;
          try { snapshot = await store.read(signal); }
          catch (error) { if (error.code === 'guard_read_changed') continue; throw error; }
          validateState(snapshot.state);
          const currentMs = Math.max(now(), snapshot.state.lastMs);
          if (snapshot.state.paused) return block(rejected('compute_paused', 30, 503), now() + cooldownMs);
          const windows = {}, exhausted = [];
          for (const period of periods) {
            const current = windowAt(period, currentMs), old = snapshot.state.windows[period];
            windows[period] = old?.start === current.start && old.end === current.end ? { ...old } : current;
            if (windows[period].count >= limits[period]) exhausted.push({ period, end: current.end });
          }
          if (exhausted.length) {
            const limiting = exhausted.reverse().sort((a, b) => b.end - a.end)[0];
            const retry = (limiting.end - currentMs) / 1000;
            // Re-read at least once per minute so an operator can lift a pause.
            return block(rejected(`limit_${limiting.period}`, retry), now() + Math.min(60000, retry * 1000));
          }
          for (const period of periods) windows[period].count++;
          if (signal.aborted) throw new ServiceError(499, 'cancelled');
          const state = { version: 1, paused: false, lastMs: currentMs, windows };
          if (await store.compareAndSwap(snapshot.generation, state, signal)) return;
        }
        return block(rejected('guard_contended', 5, 503), now() + 5000);
      } catch (error) {
        if (signal.aborted) throw new ServiceError(499, 'cancelled');
        if (error instanceof ServiceError) throw error;
        // Missing, corrupt, inaccessible or ambiguously written state never
        // grants permission to compute or initializes a fresh quota.
        return block(rejected('guard_unavailable', cooldownMs / 1000, 503), now() + cooldownMs);
      }
    },
  };
}

// Cheap in-process admission before reading a body or calling Storage. This is
// only a flood dampener; the durable guard above is the shared source of truth.
export function createIngressGate({ burst = 12, perSecond = 1, now = Date.now } = {}) {
  let tokens = burst, previous = now();
  return () => {
    const current = now();
    tokens = Math.min(burst, tokens + Math.max(0, current - previous) * perSecond / 1000);
    previous = current;
    if (tokens < 1) throw rejected('request_rate', 1);
    tokens--;
  };
}
