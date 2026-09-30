import { readJson, writeJson, root } from './common.mjs';

const verification = readJson(`${root}/verification-report.json`);
const packaging = readJson(`${root}/packaging-report.json`);
const transport = readJson(`${root}/local-transfer-report.json`);
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const report = {
  recordedAt: transport.recordedAt, source: verification.source, runtime: verification.runtime,
  options: verification.options, comparisons: packaging.comparisons,
  cases: verification.records.map(record => {
    const measured = transport.results.find(r => r.sample === record.sample && r.gridStepE7 === record.gridStepE7);
    return { ...record, loopbackMedianMs: Object.fromEntries(['downloadMs', 'decodeMs', 'hashMs', 'gunzipMs',
      'utf8Ms', 'parseAndValidateMs', 'mergeMs', 'graphMs', 'totalMs'].map(key => [key, median(measured.records.map(r => r[key]))])),
    nodeProcessMaxRssBytes: Math.max(...measured.records.map(r => r.afterGraph.maxRssBytes)),
    nodeStageHeapDeltaBytes: measured.records.map(r => r.afterGraph.heapUsed - r.before.heapUsed) };
  }),
  decision: { proposedGridStepE7: 200000, proposedEncoding: 'gzip level 6', status: 'PC evidence only; phone measurements pending' },
  limitations: [transport.limitations, 'Three samples only; not national coverage.',
    'Engine retains disconnected components from OSM; no artificial joins.',
    'Road files do not provide offline basemap tiles.', 'Production loader and permanent cache are unchanged.'],
};
writeJson('docs/quality/road-samples-report.json', report);
console.log(JSON.stringify(report.cases.filter(r => r.gridStepE7 === 200000).map(r => ({ sample: r.sample,
  files: r.files, packedBytes: r.packedBytes, totalMs: r.loopbackMedianMs.totalMs,
  gunzipMs: r.loopbackMedianMs.gunzipMs, rssMB: r.nodeProcessMaxRssBytes / 1024 / 1024 })), null, 2));
