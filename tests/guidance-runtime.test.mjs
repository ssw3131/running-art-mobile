import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createSimulationSession } from '../src/modules/guidance/session.ts';
import { demoCourse } from '../src/modules/guidance/simulator.ts';

// Exercise the real runtime with its real session/engine, without JS frame timers.
// Native promises are advanced explicitly, including replies from stopped services.
function harness() {
  let now = 0, running = false, startedToken = '', commands = [], stops = 0;
  const waits = [];
  const native = {
    start: async token => { startedToken = token; running = true; },
    stop: () => { running = false; stops++; },
    clock: () => now,
    status: () => ({ running }),
    nextTick: token => new Promise(resolve => waits.push({ token, resolve })),
    commands: () => { const result = commands; commands = []; return result; },
    publish() {}, feedback() {}, silence() {},
  };
  const appState = { currentState: 'active', addEventListener() {} };
  const imports = {
    'react-native': { AppState: appState, Platform: { OS: 'android', Version: 36 }, PermissionsAndroid: { PERMISSIONS: {}, check: async () => true } },
    '../storage/database': { getStorage: async () => ({ runs: { active: async () => null } }) },
    './session': { createSimulationSession }, './simulator': { demoCourse },
    './native': { guidanceNative: native }, './activity': { guidanceActivity: { set() {} } },
  };
  const source = fs.readFileSync(new URL('../src/modules/guidance/runtime.ts', import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: key => { assert.ok(key in imports, key); return imports[key]; },
    console: { info() {} },
    setInterval() { assert.fail('background guidance must not require frame timers'); },
    setTimeout() { assert.fail('arrival cleanup must not require frame timers'); },
  });
  const guidance = exports.guidance;
  guidance.load('test', null, 'normal');
  return {
    guidance, native, waits, appState, token: () => startedToken, stops: () => stops,
    time: value => { now = value; }, command: value => commands.push(value),
    async pulse(milliseconds = 250, alive = true) {
      now += milliseconds; assert.ok(waits.length, 'a native pulse is pending');
      waits.shift().resolve(alive);
      await Promise.resolve(); await Promise.resolve();
    },
  };
}

test('resume -> Home advances without frame timers; stale service replies cannot stop the new task', async () => {
  const h = harness(), g = h.guidance;
  await g.play(); const old = g.task({ token: h.token() });
  await h.pulse(4000); g.pause();
  assert.equal(g.snapshot().state.elapsedMs, 4000);
  h.time(90000); await g.play(); const current = g.task({ token: h.token() });
  h.appState.currentState = 'background';
  await h.pulse(0, false); await old;
  assert.equal(h.native.status().running, true);
  for (let i = 0; i < 40; i++) await h.pulse(1000);
  assert.equal(g.snapshot().state.elapsedMs, 44000);
  assert.equal(g.snapshot().error, '');
  const stopCount = h.stops(); await g.task({ token: 'stale-token' });
  assert.equal(h.stops(), stopCount);
  g.finish(); await h.pulse(0, false); await current;
});

test('native service loss settles the task and pauses with a visible error', async () => {
  const h = harness(), g = h.guidance;
  await g.play(); const task = g.task({ token: h.token() });
  await h.pulse(1000, false); await task;
  assert.equal(g.snapshot().state.playing, false);
  assert.match(g.snapshot().error, /서비스가 종료/);
  assert.equal(h.native.status().running, false);
});

test('notification stop ends the session and stops native execution', async () => {
  const h = harness(), g = h.guidance;
  await g.play(); const task = g.task({ token: h.token() });
  h.command('stop'); await h.pulse(); await task;
  assert.equal(g.snapshot().ended, true);
  assert.equal(h.native.status().running, false);
  assert.equal(h.waits.length, 0);
});

test('arrival voice grace period finishes with native pulses even when frame timers are suspended', async () => {
  const h = harness(), g = h.guidance;
  g.speed(30); await g.play(); const task = g.task({ token: h.token() });
  for (let i = 0; i < 30 && g.snapshot().state.status !== 'arrived'; i++) await h.pulse(1000);
  assert.equal(g.snapshot().state.status, 'arrived');
  await h.pulse(6999); assert.equal(h.native.status().running, true);
  await h.pulse(1); await task;
  assert.equal(h.native.status().running, false);
  assert.equal(g.snapshot().state.events.filter(e => e.kind === 'arrival').length, 1);
});
