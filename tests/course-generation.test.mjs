import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createCandidateDrafts, sameConditions } from '../src/features/course-generation/model.ts';
import { courseFromCalculation } from '../src/features/route-lab/saved-course.ts';
import { encodeSnapshot } from '../src/modules/courses/model.ts';

const grid = JSON.parse(fs.readFileSync(new URL('../assets/route-lab/grid.json', import.meta.url)));
const result = JSON.parse(fs.readFileSync(new URL('./fixtures/route-engine/grid-heart-v02.json', import.meta.url))).result;
const calculation = { result, origin: grid.origin, options: { shape: 'heart', targetKm: 3 }, liveRoads: false };
const snapshot = () => courseFromCalculation(calculation, 0);

test('S2a candidate detail preserves the exact selected result after the input changes', () => {
  const drafts = createCandidateDrafts(), value = snapshot(), original = encodeSnapshot(value);
  const id = drafts.put(value, 1, 'guest');
  value.origin.lat = 0; value.route[0][0] = 1; value.targetKm = 7;
  const detail = drafts.get(id, 'guest');
  assert.equal(encodeSnapshot(detail.snapshot).hash, original.hash);
  detail.snapshot.route[0][0] = 2;
  assert.equal(encodeSnapshot(drafts.get(id, 'guest').snapshot).hash, original.hash);
});

test('S2a stale URLs and another account cannot open or edit the draft', () => {
  const drafts = createCandidateDrafts(), id = drafts.put(snapshot(), 1, 'account-a');
  assert.equal(drafts.get(id, 'guest'), null);
  assert.equal(drafts.get(id, 'account-b'), null);
  assert.equal(drafts.get('unknown', 'account-a'), null);
  drafts.edit(id, 'account-b', { name: 'wrong' });
  assert.equal(drafts.get(id, 'account-a').name, undefined);
  drafts.clear(); assert.equal(drafts.get(id, 'account-a'), null);
});

test('S2a reopening an identical candidate preserves the name and explicit saved ID', () => {
  const drafts = createCandidateDrafts(), id = drafts.put(snapshot(), 1, 'guest');
  drafts.edit(id, 'guest', { name: '내 코스', savedId: 'a'.repeat(32) });
  assert.equal(drafts.put(snapshot(), 2, 'guest'), id);
  const read = drafts.get(id, 'guest');
  assert.equal(read.name, '내 코스'); assert.equal(read.savedId, 'a'.repeat(32)); assert.equal(read.rank, 2);
  for (let i = 0; i < 5; i++) drafts.put({ ...snapshot(), targetKm: 10 + i }, 1, 'guest');
  assert.equal(drafts.get(id, 'guest'), null);
});

test('S2a detects changed center, distance, shape, and custom outline without labeling old results as current', () => {
  const a = { origin: { lat: 37, lng: 127 }, shape: 'heart', targetKm: 3 };
  assert.equal(sameConditions(a, structuredClone(a)), true);
  for (const change of [{ targetKm: 5 }, { shape: 'fish' }, { origin: { lat: 37.1, lng: 127 } }]) assert.equal(sameConditions(a, { ...a, ...change }), false);
  const drawn = { ...a, shape: 'custom', customTemplate: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
  assert.equal(sameConditions(drawn, structuredClone(drawn)), true);
  assert.equal(sameConditions(drawn, { ...drawn, customTemplate: [{ x: 0, y: 0 }, { x: 2, y: 1 }] }), false);
});
