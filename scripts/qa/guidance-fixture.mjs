// Public v0.2 regression coordinates only; consumed by the isolated emulator QA.
import fs from 'node:fs';
import { courseFromCalculation } from '../../src/features/route-lab/saved-course.ts';
import { encodeSnapshot } from '../../src/modules/courses/model.ts';

const candidates = [];
for (const file of fs.readdirSync('tests/fixtures/route-engine').filter(v => v.endsWith('-v02.json'))) {
  const fixture = JSON.parse(fs.readFileSync(`tests/fixtures/route-engine/${file}`, 'utf8'));
  const input = JSON.parse(fs.readFileSync(`assets/route-lab/${fixture.fixture === 'grid' ? 'grid' : 'seoul'}.json`, 'utf8'));
  for (let index = 0; index < fixture.result.candidates.length; index++) {
    const value = courseFromCalculation({ origin: input.origin, options: fixture.options, result: fixture.result, liveRoads: fixture.fixture !== 'grid' }, index);
    candidates.push({ file, index, ...encodeSnapshot(value) });
  }
}
candidates.sort((a, b) => a.snapshot.lengthKm - b.snapshot.lengthKm);
fs.mkdirSync('.cache/guidance-qa', { recursive: true });
fs.writeFileSync('.cache/guidance-qa/fixture.json', JSON.stringify(candidates[0]));
console.log(JSON.stringify({ source: candidates[0].file, candidate: candidates[0].index, lengthKm: candidates[0].snapshot.lengthKm }));
