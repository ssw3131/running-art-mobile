import { readJson } from '../road-data/common.mjs';
import { readInput, runCalculation } from './runtime.mjs';
import path from 'node:path';

const directory = process.argv[2];
const entries = new Map(readJson(path.join(directory, 'index.json')).cases.map(entry => [entry.id, entry]));
const inputs = new Map();
process.on('message', ({ id, caseId }) => {
  try {
    const started = performance.now();
    const entry = entries.get(caseId);
    if (!entry) throw new Error('Unknown benchmark case');
    const inputCached = inputs.has(caseId);
    if (!inputCached) inputs.set(caseId, readInput(directory, entry));
    const preparationMs = performance.now() - started;
    const calculation = runCalculation(inputs.get(caseId));
    if (calculation.resultSha256 !== entry.expectedResultSha256) throw new Error('Result lock mismatch');
    process.send({ id, ...calculation, metrics: { ...calculation.metrics, preparationMs, inputCached,
      workerTotalMs: performance.now() - started, workerPid: process.pid } });
  } catch (error) { process.send({ id, error: error.message }); }
});
process.send({ ready: true });
process.on('disconnect', () => process.exit(0));
