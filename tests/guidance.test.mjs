import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuidance } from '../src/modules/guidance/engine.ts';
import { demoCourse, createSimulator, SCENARIOS } from '../src/modules/guidance/simulator.ts';
import { createSimulationSession } from '../src/modules/guidance/session.ts';
import { offset, prepareRoute, positionAt, turnsFor } from '../src/modules/guidance/geometry.ts';
import fs from 'node:fs';
import { courseFromCalculation } from '../src/features/route-lab/saved-course.ts';

function replay(scenario, limit = 6000) {
  const points = demoCourse(scenario), source = createSimulator(points, scenario), engine = createGuidance(points), states = [];
  engine.ingest(source.sample());
  for (let i = 0; i < limit; i++) {
    const fix = source.step();
    const s = fix ? engine.ingest(fix) : engine.tick(source.elapsed());
    states.push(s);
    if (s.status === 'arrived') break;
  }
  return { state: engine.snapshot(), states, engine };
}
for (const scenario of SCENARIOS) test(`scripted ${scenario.id} reaches the finish in order`, () => {
  const { state, states } = replay(scenario.id);
  assert.equal(state.status, 'arrived', JSON.stringify({ state: state.status, progress: state.progressM, total: state.totalM, instruction: state.instruction }));
  assert.equal(state.remainingM, 0);
  assert.equal(state.events.filter(e => e.kind === 'arrival').length, 1);
  assert.ok(states.findIndex(s => s.status === 'arrived') > 50, 'never finishes at a repeated start coordinate');
  for (let i = 1; i < states.length; i++) assert.ok(states[i].progressM - states[i - 1].progressM < 80, 'no crossing/overlap progress teleport');
});
test('detour emits one alert and one return, counts extra travel but not course progress', () => {
  const { state, states } = replay('detour');
  assert.equal(state.events.filter(e => e.kind === 'off-route').length, 1);
  assert.equal(state.events.filter(e => e.kind === 'returned').length, 1);
  assert.ok(state.distanceM > state.totalM + 120);
  const off = states.filter(s => s.status === 'off-route');
  assert.ok(off.length > 5);
  assert.ok(Math.max(...off.map(s => s.returnM)) > 70);
  assert.ok(Math.max(...off.map(s => s.progressM)) - Math.min(...off.map(s => s.progressM)) < 1);
});
test('deterministic jitter remains on course; missing fixes never produce an off-route alert', () => {
  assert.equal(replay('jitter').state.events.filter(e => e.kind === 'off-route').length, 0);
  const loss = replay('loss');
  assert.ok(loss.states.some(s => s.status === 'weak'));
  assert.equal(loss.state.events.filter(e => e.kind === 'off-route').length, 0);
});
test('pause excludes wall time and 30x emits one-second virtual fixes, not GPS jumps', () => {
  const session = createSimulationSession(demoCourse('normal'), 'normal');
  session.play(0); session.update(10000); session.pause(10000);
  const before = session.snapshot(); session.update(500000);
  assert.deepEqual(session.snapshot(), before);
  session.setSpeed(30, 500000); session.play(500000); session.update(510000);
  assert.equal(session.snapshot().elapsedMs, 310000);
  assert.equal(session.snapshot().status, 'normal');
  assert.ok(session.snapshot().progressM > 800);
});
test('bad accuracy, out-of-order fixes and jumps cannot advance or finish', () => {
  const points = demoCourse('normal'), engine = createGuidance(points);
  engine.ingest({ position: points[0], timestamp: 0, accuracy: 5 });
  engine.ingest({ position: points.at(-1), timestamp: 1000, accuracy: 100 });
  assert.equal(engine.snapshot().status, 'weak'); assert.equal(engine.snapshot().progressM, 0);
  engine.ingest({ position: points[0], timestamp: 2000, accuracy: 5 });
  engine.ingest({ position: points.at(-1), timestamp: 3000, accuracy: 5 });
  assert.equal(engine.snapshot().status, 'weak'); assert.equal(engine.snapshot().progressM, 0);
  assert.equal(engine.ingest({ position: points[0], timestamp: 1000, accuracy: 5 }).elapsedMs, 3000);
});
test('a gap during a detour does not fabricate a straight return path', () => {
  const points = demoCourse('normal'), source = createSimulator(points, 'normal'), engine = createGuidance(points);
  engine.ingest(source.sample()); for (let i = 0; i < 20; i++) engine.ingest(source.step());
  source.command('depart'); for (let i = 0; i < 30; i++) engine.ingest(source.step());
  assert.equal(engine.snapshot().status, 'off-route');
  source.command('lost'); for (let i = 0; i < 10; i++) { source.step(); engine.tick(source.elapsed()); }
  source.command('normal'); engine.ingest(source.step());
  assert.equal(engine.snapshot().status, 'weak'); assert.deepEqual(engine.snapshot().returnPath, []);
});
test('a stopped runner retains the last moving heading for the return arrow', () => {
  const points = demoCourse('normal'), source = createSimulator(points, 'normal'), engine = createGuidance(points);
  engine.ingest(source.sample());
  for (let i = 0; i < 20; i++) engine.ingest(source.step());
  source.command('depart');
  for (let i = 0; i < 60; i++) engine.ingest(source.step());
  const stopped = engine.snapshot();
  assert.equal(stopped.status, 'off-route');
  assert.equal(stopped.direction, 'uturn');
  for (let i = 0; i < 10; i++) engine.ingest(source.step());
  assert.equal(engine.snapshot().direction, 'uturn');
  assert.equal(engine.snapshot().distanceM, stopped.distanceM);
});
test('normal accuracy after a moving weak interval can rejoin the sequential course window', () => {
  const points = demoCourse('normal'), source = createSimulator(points, 'normal'), engine = createGuidance(points);
  engine.ingest(source.sample());
  for (let i = 0; i < 20; i++) engine.ingest(source.step());
  const before = engine.snapshot();
  source.command('weak');
  for (let i = 0; i < 30; i++) engine.ingest(source.step());
  assert.equal(engine.snapshot().status, 'weak');
  assert.equal(engine.snapshot().progressM, before.progressM);
  assert.equal(engine.snapshot().distanceM, before.distanceM);
  source.command('normal');
  for (let i = 0; i < 8; i++) engine.ingest(source.step());
  assert.equal(engine.snapshot().status, 'normal');
  assert.ok(engine.snapshot().progressM > before.progressM + 80);
  assert.ok(engine.snapshot().distanceM < before.distanceM + 25, 'never counts an unknown gap as traveled');
  assert.equal(engine.snapshot().events.filter(e => e.kind === 'off-route').length, 0);
});
test('turns include left, right and uturn; duplicate vertices do not add instructions', () => {
  const points = demoCourse('turns'), turns = turnsFor(prepareRoute(points));
  for (const kind of ['left', 'right', 'uturn']) assert.ok(turns.some(t => t.kind === kind), kind);
  assert.equal(turnsFor(prepareRoute(points.flatMap(p => [p, p]))).length, turns.length);
});
test('20,000 points are retained and route snapshots are not mutated', () => {
  const points = Array.from({ length: 20000 }, (_, i) => offset([127, 37], i * 0.1, 0));
  const before = JSON.stringify(points), engine = createGuidance(points);
  assert.equal(engine.route.points.length, 20000);
  for (let t = 0; t <= 725000; t += 1000) engine.ingest({ timestamp: t, accuracy: 5, position: positionAt(engine.route, t / 360) });
  assert.equal(engine.snapshot().status, 'arrived'); assert.equal(JSON.stringify(points), before);
});
test('invalid routes fail before a simulation can start', () => {
  for (const points of [[], [[0, 0]], [[0, 0], [0, 0]], [[0, 0], [NaN, 2]]]) assert.throws(() => createGuidance(points));
});
test('all 25 original saved-course candidates finish without changing coordinate order', () => {
  let count = 0;
  for (const file of fs.readdirSync('tests/fixtures/route-engine').filter(v => v.endsWith('-v02.json'))) {
    const fixture = JSON.parse(fs.readFileSync(`tests/fixtures/route-engine/${file}`, 'utf8'));
    const input = JSON.parse(fs.readFileSync(`assets/route-lab/${fixture.fixture === 'grid' ? 'grid' : 'seoul'}.json`, 'utf8'));
    for (let index = 0; index < fixture.result.candidates.length; index++) {
      const snapshot = courseFromCalculation({ origin: input.origin, options: fixture.options, result: fixture.result, liveRoads: fixture.fixture !== 'grid' }, index);
      const saved = JSON.stringify(snapshot), source = createSimulator(snapshot.route, 'normal'), engine = createGuidance(snapshot.route);
      engine.ingest(source.sample());
      const budget = Math.ceil(engine.route.totalMeters * .36) + 20;
      for (let i = 0; i < budget && engine.snapshot().status !== 'arrived'; i++) engine.ingest(source.step());
      assert.equal(engine.snapshot().status, 'arrived', `${file} candidate ${index}: ${engine.snapshot().progressM}/${engine.route.totalMeters}`);
      assert.equal(JSON.stringify(snapshot), saved); count++;
    }
  }
  assert.equal(count, 25);
});
