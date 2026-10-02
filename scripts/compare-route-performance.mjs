// Compare actual computation in alternating fresh Node processes. No timing assertions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const baseline = option('--baseline');
assert.ok(baseline, 'Provide --baseline with the preserved, pre-change engine.ts');
const current = option('--current', 'src/modules/route-engine/engine.ts');
const runs = Number(option('--runs', '5'));
assert.ok(Number.isInteger(runs) && runs >= 2 && runs <= 20);
const cases = option('--cases', 'seoul-heart-5km-v02,seoul-heart-v02,seoul-diamond-v02,grid-heart-v02,grid-heart-v01,grid-diamond-v02').split(',');
for (const id of cases) assert.match(id, /^[a-z0-9-]+$/);
const output = option('--output', '.cache/route-performance/comparison.json');
const digest = (file) => createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const sources = { baseline: digest(baseline), current: digest(current) };
const median = (values) => {
  const sorted = [...values].sort((a,b) => a-b);
  return (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2;
};
const report = {
  recordedAt: new Date().toISOString(), runtime: process.version,
  platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model,
  method: 'Alternating baseline/current order, one full calculation per fresh process; no profiler; source/output hashes and every routing diagnostic checked. Node is not Android/Hermes.',
  sourceSha256: sources, runsPerEngine: runs, cases: [],
};
for (const caseId of cases) {
  const records = { baseline: [], current: [] };
  for (let round = 0; round < runs; round++) {
    for (const label of round % 2 ? ['current','baseline'] : ['baseline','current']) {
      const result = spawnSync(process.execPath, ['scripts/benchmark-route-engine.mjs','--engine',label === 'baseline' ? baseline : current,'--case',caseId,'--runs','1'], { encoding:'utf8', maxBuffer:8*1024*1024 });
      assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
      const record = result.stdout.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(item=>item.resultSha256);
      assert.ok(record, 'Benchmark must emit a result record');
      const reference = records.baseline[0] ?? records.current[0];
      if (reference) {
        assert.equal(record.resultSha256, reference.resultSha256);
        assert.deepEqual(record.diagnostics, reference.diagnostics);
        assert.equal(record.nodes, reference.nodes);
        assert.equal(record.edges, reference.edges);
      }
      records[label].push({...record, run:round+1});
    }
    console.log(`${caseId}: ${round+1}/${runs} pairs, full results and diagnostics match`);
  }
  const baselineMedianMs = median(records.baseline.map(r=>r.elapsedMs));
  const currentMedianMs = median(records.current.map(r=>r.elapsedMs));
  report.cases.push({caseId, baselineMedianMs, currentMedianMs, reductionPercent:(1-currentMedianMs/baselineMedianMs)*100, records});
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, JSON.stringify(report,null,2)+'\n');
}
assert.equal(digest(baseline), sources.baseline, 'Baseline changed during measurement');
assert.equal(digest(current), sources.current, 'Current engine changed during measurement');
report.completedAt = new Date().toISOString();
fs.writeFileSync(output, JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.cases.map(({caseId,baselineMedianMs,currentMedianMs,reductionPercent})=>({caseId,baselineMedianMs,currentMedianMs,reductionPercent})),null,2));
