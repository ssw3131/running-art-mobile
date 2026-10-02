// Analyze a release Hermes sampling trace with its matching release source map.
// Usage: node scripts/qa/analyze-hermes-profile.cjs TRACE MAP OUTPUT
const fs = require('node:fs');
const { SourceMapConsumer } = require('source-map');
const [tracePath, mapPath, outputPath] = process.argv.slice(2);
if (!tracePath || !mapPath || !outputPath) throw new Error('Expected TRACE MAP OUTPUT');
const profile = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const map = new SourceMapConsumer(JSON.parse(fs.readFileSync(mapPath, 'utf8')));
const frames = profile.stackFrames;
for (const frame of Object.values(frames)) {
  if (frame.funcVirtAddr != null) {
    frame.source = map.originalPositionFor({ line: 1, column: Number(frame.funcVirtAddr) + Number(frame.offset) });
  }
}
const self = {}, inclusive = {}, lines = {};
let count = 0, gc = 0;
for (const sample of profile.samples) {
  const stack = [];
  for (let frame = frames[sample.sf]; frame; frame = frames[frame.parent]) stack.push(frame);
  if (!stack.some(frame => ['shortestPathSteps', 'searchSteps', 'routeFromTemplateSteps', 'buildGraphSteps'].includes(frame.name))) continue;
  count++;
  const leaf = stack[0], name = leaf.name || leaf.source?.name || '(anonymous)';
  self[name] = (self[name] || 0) + 1;
  if (name.includes('GC')) gc++;
  if (leaf.source?.source?.endsWith('/engine.ts')) {
    const line = `${leaf.source.line}:${leaf.source.column}`;
    lines[line] = (lines[line] || 0) + 1;
  }
  for (const name of new Set(stack.map(frame => frame.name || frame.source?.name || '(anonymous)'))) {
    inclusive[name] = (inclusive[name] || 0) + 1;
  }
}
if (!count) throw new Error('No engine samples; check that this is the matching release trace');
const sorted = values => Object.entries(values).sort((a, b) => b[1] - a[1])
  .map(([name, samples]) => ({ name, samples, percent: 100 * samples / count }));
const report = {
  method: 'Counts of samples with an engine ancestor; approximate proportions, not exact function durations. Profiled runs are excluded from wall-time comparisons.',
  totalSamples: profile.samples.length, engineSamples: count, gcSamplesUnderEngine: gc,
  self: sorted(self), inclusive: sorted(inclusive), engineLines: sorted(lines),
};
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ engineSamples: count, self: report.self.slice(0, 8) }));
