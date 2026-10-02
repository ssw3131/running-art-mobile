import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { readJson, writeJson } from './common.mjs';
import { validateConfig } from './deployment.mjs';
import { loadNationalBundle, nationalPlan, NATIONAL_CURRENT_KEY } from './national-deployment.mjs';
import { uploadBundle, verifyPublic, currentState, promoteBundle } from './publish.mjs';
import { createR2Store } from './r2-store.mjs';
import { createPacedPublicFetch } from './public-transport.mjs';

let store;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    bundle: { type: 'string', default: 'build/road-data/national-verified' }, config: { type: 'string' },
    expect: { type: 'string' }, apply: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' }, report: { type: 'string' },
    'reuse-inventory': { type: 'string' },
  } });
  const [command] = positionals;
  assert.ok(positionals.length === 1 && ['plan','upload','verify','current','promote'].includes(command), 'plan/upload/verify/current/promote 중 하나를 지정하세요.');
  assert.ok(!values.apply || ['upload','promote'].includes(command), '--apply는 upload/promote 전용입니다.');
  assert.ok(!values['reuse-inventory'] || command === 'upload', '--reuse-inventory는 upload 전용입니다.');
  const config = values.config ? validateConfig(readJson(values.config)) : undefined;
  const concurrency = Number(values.concurrency);
  assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= (command === 'upload' ? 8 : 32));
  const options = { concurrency, networkRetries: 3,
    onNetworkRetry: event => console.log(JSON.stringify({ command, phase: 'public-network-retry', ...event })),
    onProgress: ({ completed, total, phase }) => {
    if (completed % 100 === 0 || completed === total) console.log(JSON.stringify({ command, phase, completed, total }));
  } };
  if (config?.publicUrlMode === 'r2-dev') {
    options.fetchHandlesTimeout = true;
    options.fetchImpl = createPacedPublicFetch({ onThrottle: event => console.log(JSON.stringify({ command, phase: 'public-throttle', ...event })) });
  }
  const bundle = command === 'current' ? null : loadNationalBundle(values.bundle);
  let result;
  if (command === 'plan' || (['upload','promote'].includes(command) && !values.apply)) result = nationalPlan(bundle, config);
  else {
    assert.ok(config, '--config가 필요합니다.');
    if (command === 'verify') result = await verifyPublic(bundle, config.publicBaseUrl, options);
    else {
      store = createR2Store(config);
      if (command === 'current') result = await currentState(store, NATIONAL_CURRENT_KEY);
      else if (command === 'upload') {
        const baseline = values['reuse-inventory'] ? readJson(values['reuse-inventory']) : undefined;
        if (baseline) {
          assert.equal(baseline.format, 'running-art-national-inventory');
          assert.ok(Array.isArray(baseline.files) && baseline.files.every(f => /^[a-f0-9]{64}$/.test(f.sha256)));
        }
        const shared = new Set(baseline?.files.map(f => `roads/national/v1/tiles/${f.sha256}.json.gz`) ?? []);
        const pending = bundle.objects.filter(object => !shared.has(object.key));
        result = { ...await uploadBundle({ ...bundle, objects: pending }, store, options),
          skippedByBaseline: bundle.objects.length - pending.length,
          baselineVerifiedRemotely: false };
        // This is only an upload optimization. Promotion still reads and hashes
        // every origin/public object, including shared baseline files.
      } else result = await promoteBundle(bundle, store, config.publicBaseUrl, values.expect, options);
    }
  }
  const report = { recordedAt: new Date().toISOString(), command, developmentOnly: config?.publicUrlMode === 'r2-dev', ...result };
  if (values.report) writeJson(values.report, report);
  console.log(JSON.stringify({ ...report, records: undefined }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store?.close(); }
