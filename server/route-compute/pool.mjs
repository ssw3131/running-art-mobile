import { Worker } from 'node:worker_threads';

export class ServiceError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

// One CPU-bound job per instance. Terminating the worker also stops a synchronous
// graph search when the client disconnects; no detached billable work continues.
export function createComputePool({ workerUrl = new URL('./worker.mjs', import.meta.url), timeoutMs = 60000 } = {}) {
  let worker, active = false, closed = false;
  async function stop() { const old = worker; worker = undefined; if (old) await old.terminate(); }
  return {
    async run(request, signal) {
      if (active || closed) throw new ServiceError(503, 'busy');
      if (signal.aborted) throw new ServiceError(499, 'cancelled');
      active = true;
      try {
        worker ??= new Worker(workerUrl, { resourceLimits: { maxOldGenerationSizeMb: 512 } });
        const current = worker;
        return await new Promise((resolve, reject) => {
          let finished = false;
          const done = async (error, value) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer); signal.removeEventListener('abort', abort);
            current.removeListener('message', message); current.removeListener('error', failed); current.removeListener('exit', failed);
            if (error) await stop();
            if (error) reject(error); else resolve(value);
          };
          const abort = () => { void done(new ServiceError(499, 'cancelled')); };
          const failed = () => { void done(new ServiceError(503, 'unavailable')); };
          const message = result => { void done(result.ok ? null : new ServiceError(503, 'unavailable'), result.value); };
          const timer = setTimeout(() => { void done(new ServiceError(504, 'timeout')); }, timeoutMs);
          current.once('message', message); current.once('error', failed); current.once('exit', failed);
          signal.addEventListener('abort', abort, { once: true });
          current.postMessage(request);
        });
      } finally { active = false; }
    },
    async close() { closed = true; await stop(); },
  };
}
