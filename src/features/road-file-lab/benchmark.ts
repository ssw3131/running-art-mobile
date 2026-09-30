import { strToU8 } from 'fflate';
import { buildGraph } from '../../modules/route-engine/engine.ts';
import { roadBounds } from '../../modules/road-data/client.ts';
import { mobileRoadCodecs } from '../../modules/road-data/mobile-codecs.ts';
import { decodeRoadTile, mergeRoadTiles, selectRoadFiles, validateManifest } from '../../modules/road-data/file-format.ts';
import type { RoadTile } from '../../modules/road-data/file-format.ts';
import type { Origin } from '../../modules/route-engine/types.ts';

const BASE = 'http://127.0.0.1:8766'; // adb reverse only; never an application road provider.
type LabCase = { id: string; origin: Origin; radiusMeters: number; queryWays: number; nodes: number; edges: number; inputSha256: string };
export async function runRoadFileBenchmark(settings: {
  signal: AbortSignal; gridStepE7: number; progress: (text: string) => void; yieldToHost: () => Promise<void>;
}) {
  const { signal, gridStepE7, progress, yieldToHost } = settings;
  const hermes = !!(globalThis as typeof globalThis & { HermesInternal?: unknown }).HermesInternal;
  console.info(`ROAD_FILE_LAB_START ${JSON.stringify({ gridStepE7, hermes, developmentJavaScript: __DEV__ })}`);
  if (![100000, 200000, 400000].includes(gridStepE7)) throw new Error('지원하지 않는 격자입니다.');
  const check = () => { if (signal.aborted) throw new Error('표본 검증을 취소했어요.'); };
  async function get(path: string) {
    check();
    const response = await fetch(`${BASE}/${path}`, { signal });
    if (!response.ok) throw new Error(`로컬 표본 응답 오류: ${response.status}`);
    return response;
  }
  const manifest: unknown = await (await get(`grid-${gridStepE7}/manifest.json`)).json();
  validateManifest(manifest);
  const cases: LabCase[] = await (await get('benchmark-cases.json')).json();
  if (!Array.isArray(cases) || cases.length !== 3) throw new Error('표본 목록을 확인하세요.');
  const records = [];
  for (const sample of cases) for (let run = 1; run <= 3; run++) {
    check(); progress(`${sample.id} · ${run}/3`); await yieldToHost();
    const bounds = roadBounds(sample.origin, sample.radiusMeters), files = selectRoadFiles(manifest, bounds);
    const tiles: RoadTile[] = [];
    const phases = { hashMs: 0, gunzipMs: 0, utf8Ms: 0 };
    const timed = {
      sha256: (bytes: Uint8Array) => { const at = performance.now(); const result = mobileRoadCodecs.sha256(bytes); phases.hashMs += performance.now() - at; return result; },
      gunzip: (bytes: Uint8Array, max: number) => { const at = performance.now(); const result = mobileRoadCodecs.gunzip(bytes, max); phases.gunzipMs += performance.now() - at; return result; },
      utf8: (bytes: Uint8Array) => { const at = performance.now(); const result = mobileRoadCodecs.utf8(bytes); phases.utf8Ms += performance.now() - at; return result; },
    };
    const started = performance.now();
    let downloadMs = 0, decodeMs = 0;
    for (const file of files) {
      let at = performance.now();
      const bytes = new Uint8Array(await (await get(`grid-${gridStepE7}/${file.path}`)).arrayBuffer());
      check(); downloadMs += performance.now() - at;
      at = performance.now(); tiles.push(decodeRoadTile(bytes, manifest, file, timed)); decodeMs += performance.now() - at;
      await yieldToHost(); check();
    }
    let at = performance.now();
    const elements = mergeRoadTiles(manifest, tiles, bounds), mergeMs = performance.now() - at;
    check(); await yieldToHost();
    at = performance.now(); const graph = buildGraph(elements, sample.origin, sample.radiusMeters); const graphMs = performance.now() - at;
    const inputSha256 = mobileRoadCodecs.sha256(strToU8(JSON.stringify(elements)));
    if (elements.length !== sample.queryWays || graph.nodes.length !== sample.nodes || graph.edges.length !== sample.edges || inputSha256 !== sample.inputSha256) {
      throw new Error(`PC 기준 입력과 다릅니다: ${sample.id}`);
    }
    const record = { sample: sample.id, gridStepE7, run, files: files.length,
      bytes: files.reduce((n, f) => n + f.bytes, 0), downloadMs, decodeMs, ...phases,
      mergeMs, graphMs, totalMs: performance.now() - started, inputSha256,
      nodes: graph.nodes.length, edges: graph.edges.length, inputEqual: true };
    records.push(record);
    console.info(`ROAD_FILE_LAB ${JSON.stringify(record)}`);
    check(); await yieldToHost();
  }
  const report = { recordedAt: new Date().toISOString(), gridStepE7,
    hermes, developmentJavaScript: __DEV__, transport: 'adb reverse to Windows loopback; not CDN or mobile network',
    release: manifest.release, records };
  return report;
}
