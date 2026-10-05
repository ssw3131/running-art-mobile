// Loopback-only measurement server. This is not a public production API.
import http from 'node:http';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { readJson } from '../road-data/common.mjs';

export async function startServer({ directory, workers = 1, maxQueue = 8, timeoutMs = 180000 }) {
  assert.ok(Number.isInteger(workers) && workers >= 1 && workers <= 4);
  assert.ok(Number.isInteger(maxQueue) && maxQueue >= 0 && maxQueue <= 32);
  const started = performance.now();
  const cases = new Set(readJson(path.join(directory, 'index.json')).cases.map(entry => entry.id));
  const pool = [], queue = [];
  let nextId = 0, closed = false, failed = false;
  const reject = (job, status, message) => {
    if (!job.response.destroyed) {
      job.response.writeHead(status, { 'content-type': 'application/json' });
      job.response.end(JSON.stringify({ error: message }));
    }
  };
  function fail() {
    if (closed || failed) return;
    failed = true;
    for (const slot of pool) {
      clearTimeout(slot.timer);
      if (slot.job) reject(slot.job, 500, 'Worker failed');
      slot.job = null;
      slot.child.kill();
    }
    queue.splice(0).forEach(job => reject(job, 503, 'Worker pool unavailable'));
  }
  function dispatch() {
    if (closed || failed) return;
    for (const slot of pool) {
      if (slot.job) continue;
      let job;
      do { job = queue.shift(); } while (job?.response.destroyed);
      if (!job) continue;
      slot.job = job;
      job.queueMs = performance.now() - job.received;
      slot.timer = setTimeout(fail, timeoutMs);
      slot.child.send({ id: job.id, caseId: job.caseId }, error => { if (error) fail(); });
    }
  }
  try {
    await Promise.all(Array.from({ length: workers }, async () => {
      const child = fork(new URL('./worker.mjs', import.meta.url), [path.resolve(directory)], {
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true,
      });
      const slot = { child, job: null, timer: null };
      pool.push(slot);
      child.on('error', fail);
      child.on('exit', fail);
      await new Promise((resolve, rejectReady) => {
        const timer = setTimeout(() => rejectReady(new Error('Worker startup timeout')), 30000);
        const exited = () => { clearTimeout(timer); rejectReady(new Error('Worker startup failed')); };
        child.once('exit', exited);
        child.once('error', exited);
        child.once('message', message => {
          clearTimeout(timer); child.off('exit', exited); child.off('error', exited);
          if (message.ready) resolve(); else rejectReady(new Error('Worker not ready'));
        });
      });
      child.on('message', message => {
        const job = slot.job;
        if (!job || message.id !== job.id) { fail(); return; }
        clearTimeout(slot.timer); slot.job = null;
        if (message.error) reject(job, 500, message.error);
        else if (!job.response.destroyed) {
          const serverMs = performance.now() - job.received;
          job.response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store',
            'x-benchmark-metrics': JSON.stringify({ ...message.metrics, queueMs: job.queueMs, serverMs,
              parentRssBytes: process.memoryUsage().rss, resultSha256: message.resultSha256 }) });
          job.response.end(message.serialized);
        }
        dispatch();
      });
    }));
  } catch (error) { closed = true; await Promise.all(pool.map(stopChild)); throw error; }

  const server = http.createServer((request, response) => {
    const received = performance.now();
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    if (request.url === '/health') {
      response.writeHead(failed ? 503 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ active: pool.filter(slot => slot.job).length, queued: queue.length })); return;
    }
    const caseId = request.url?.match(/^\/calculate\/([a-z]+)$/)?.[1];
    const job = { id: ++nextId, caseId, response, received };
    if (!cases.has(caseId)) { reject(job, 404, 'Unknown benchmark case'); return; }
    if (failed) { reject(job, 503, 'Worker pool unavailable'); return; }
    // Remove disconnected waiting clients before applying the bound.
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].response.destroyed) queue.splice(i, 1);
    if (pool.every(slot => slot.job) && queue.length >= maxQueue) { reject(job, 503, 'Queue full'); return; }
    queue.push(job); dispatch();
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  } catch (error) { closed = true; await Promise.all(pool.map(stopChild)); throw error; }
  return { url: `http://127.0.0.1:${server.address().port}`, startupMs: performance.now() - started,
    async close() {
      closed = true;
      const stopped = new Promise(resolve => server.close(resolve));
      queue.splice(0).forEach(job => reject(job, 503, 'Benchmark ended'));
      for (const slot of pool) { clearTimeout(slot.timer); if (slot.job) reject(slot.job, 503, 'Benchmark ended'); }
      await Promise.all(pool.map(stopChild));
      server.closeAllConnections();
      await stopped;
    },
  };
}

async function stopChild({ child }) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill(); await exited;
}
