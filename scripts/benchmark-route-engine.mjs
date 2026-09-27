// Fixed-input synchronous Node benchmark. Android/Hermes must be measured separately.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const caseId = option('--case', 'seoul-heart-5km-v02');
const enginePath = path.resolve(option('--engine', 'src/modules/route-engine/engine.ts'));
const runs = Number(option('--runs', '3'));
assert.ok(Number.isInteger(runs) && runs > 0 && runs <= 20, 'runs must be 1..20');
assert.match(caseId, /^[a-z0-9-]+$/);
const expected = JSON.parse(fs.readFileSync(`tests/fixtures/route-engine/${caseId}.json`));
const fixture = JSON.parse(fs.readFileSync(`assets/route-lab/${expected.fixture}.json`));
const imported = await import(pathToFileURL(enginePath).href);
const engine = imported.default ?? imported;
const records = [];
for (let run = 0; run < runs; run++) {
  const started = performance.now();
  const graph = engine.buildGraph(fixture.elements, fixture.origin, expected.options.radiusKm * 1000);
  const graphDone = performance.now();
  const phasesMs = {};
  let phase = 'search-start', phaseStarted = graphDone;
  const diagnostics = {};
  const result = engine.search(graph, expected.options, (p) => {
    const next = p.phase === 'routing' ? p.text.split(' · ')[0] : p.phase;
    if (next !== phase) {
      const now = performance.now();
      phasesMs[phase] = (phasesMs[phase] ?? 0) + now - phaseStarted;
      phase = next; phaseStarted = now;
    }
  }, diagnostics);
  const ended = performance.now();
  phasesMs[phase] = (phasesMs[phase] ?? 0) + ended - phaseStarted;
  const serialized = JSON.stringify(result);
  assert.deepEqual(JSON.parse(serialized), expected.result, 'complete original result');
  const record = { run: run + 1, graphMs: graphDone - started, searchMs: ended - graphDone, elapsedMs: ended - started, phasesMs, diagnostics, nodes: graph.nodes.length, edges: graph.edges.length, resultSha256: createHash('sha256').update(serialized).digest('hex') };
  records.push(record);
  console.log(JSON.stringify(record));
}
const sorted = records.map((r) => r.elapsedMs).sort((a, b) => a - b);
const report = { recordedAt: new Date().toISOString(), runtime: process.version, engine: path.relative(process.cwd(), enginePath), caseId, runs, medianMs: (sorted[Math.floor((runs - 1) / 2)] + sorted[Math.floor(runs / 2)]) / 2, records };
const output = option('--output');
if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ caseId, runs, medianMs: report.medianMs }));
