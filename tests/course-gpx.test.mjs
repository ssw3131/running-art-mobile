import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { courseGpx, GPX_MIME_TYPE } from '../src/modules/courses/gpx.ts';
import { createCourseExporter, exportErrorMessage } from '../src/modules/courses/export.ts';
import { COURSE_POINTS_MAX } from '../src/modules/courses/model.ts';
import { createCourseRepository } from '../src/modules/courses/repository.ts';
import { migrateDatabase } from '../src/modules/storage/migrations.ts';
import { courseFromCalculation } from '../src/features/route-lab/saved-course.ts';
import { openSqlite } from './helpers/sqlite.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const grid = read('tests/fixtures/route-engine/grid-heart-v02.json');
function course(fixture = grid, index = 0) {
  const input = read(`assets/route-lab/${fixture.fixture === 'grid' ? 'grid' : 'seoul'}.json`);
  const snapshot = courseFromCalculation({ origin: input.origin, options: fixture.options,
    result: fixture.result, liveRoads: fixture.fixture !== 'grid' }, index);
  return { id: '0123456789abcdef0123456789abcdef', name: '한강 코스 🏃', createdAt: 1000, updatedAt: 2000,
    source: snapshot.source, shape: snapshot.shape, targetKm: snapshot.targetKm,
    lengthKm: snapshot.lengthKm, score: snapshot.score, snapshot };
}
const points = xml => [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"\/>/g)].map(m => [Number(m[2]), Number(m[1])]);
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const artifacts = path.resolve('.cache/gpx-tests'); fs.mkdirSync(artifacts, { recursive: true });
function services(overrides = {}) {
  return { load: async () => course(), isAvailable: async () => true,
    write: async () => ({ uri: 'file:///test.gpx', discard: async () => {} }), share: async () => {}, ...overrides };
}

test('all 25 baseline candidates export the entire ordered route and preserve saved data', () => {
  let count = 0;
  const manifest = [];
  for (const file of fs.readdirSync('tests/fixtures/route-engine').filter(v => v.endsWith('-v02.json'))) {
    const fixture = read(`tests/fixtures/route-engine/${file}`);
    for (let i = 0; i < fixture.result.candidates.length; i++) {
      const saved = course(fixture, i), before = structuredClone(saved), result = courseGpx(saved);
      assert.deepEqual(points(result.xml), saved.snapshot.route);
      assert.deepEqual(saved, before);
      assert.equal((result.xml.match(/<trk>/g) || []).length, 1);
      assert.equal((result.xml.match(/<trkseg>/g) || []).length, 1);
      assert.doesNotMatch(result.xml, /<(time|ele|speed|wpt|rte|extensions)(?:>|\s)/);
      assert.match(result.xml, /version="1.1" creator="Running Art"/);
      assert.equal(result.xml.includes('OpenStreetMap contributors'), saved.source === 'osm');
      const name = `candidate-${++count}.gpx`;
      fs.writeFileSync(path.join(artifacts, name), result.xml);
      manifest.push({ name, route: saved.snapshot.route, title: saved.name, source: saved.source });
    }
  }
  assert.equal(count, 25);
  fs.writeFileSync(path.join(artifacts, 'manifest.json'), JSON.stringify(manifest));
});

test('names escape XML markup and unsafe file characters while preserving Korean and emoji in XML', () => {
  const saved = course(); saved.name = `../한강 <trkpt> & "공원" '🏃' / \\ : ? *`;
  const result = courseGpx(saved);
  assert.match(result.xml, /&lt;trkpt&gt; &amp; &quot;공원&quot; &apos;🏃&apos;/);
  assert.match(result.xml, /가상 테스트 코스/);
  assert.doesNotMatch(result.fileName, /[<>:"/\\|?*\s]/);
  assert.ok(result.fileName.startsWith('running-art-'));
  assert.ok(result.fileName.endsWith('-01234567.gpx'));
  fs.writeFileSync(path.join(artifacts, 'escaped.gpx'), result.xml);
});

test('GPX decimal coordinates preserve supported tiny numbers and normalize the equivalent positive antimeridian', () => {
  const saved = course();
  saved.snapshot.route = [[180, 1e-7], [-180, -1e-18], [1e-20, -0]];
  const result = courseGpx(saved);
  assert.deepEqual(points(result.xml), [[-180, 1e-7], [-180, -1e-18], [1e-20, 0]]);
  assert.doesNotMatch(result.xml, /(?:lat|lon)="[^"]*[eE][^"]*"/);
  fs.writeFileSync(path.join(artifacts, 'decimal.gpx'), result.xml);
  for (const tiny of [Number.MIN_VALUE, -1e-30, 1e-21, 0.0000010000000000000002]) {
    saved.snapshot.route[0] = [tiny, 0];
    assert.throws(() => courseGpx(saved), { code: 'validation' });
    assert.equal(saved.snapshot.route[0][0], tiny);
  }
});

test('invalid XML names and corrupted coordinates cannot produce a GPX document', () => {
  for (const name of ['bad\ud800', 'bad\udfff', 'bad\ufffe', 'bad\uffff', 'bad\0', '']) {
    assert.throws(() => courseGpx({ ...course(), name }), { code: 'validation' });
  }
  for (const coordinate of [[NaN, 0], [0, Infinity], [181, 0], [0, -86]]) {
    const saved = course(); saved.snapshot.route[0] = coordinate;
    assert.throws(() => courseGpx(saved), { code: 'validation' });
  }
  assert.throws(() => courseGpx({ ...course(), id: '../escape' }), { code: 'missing' });
});

test('20,000 points including repeated vertices export without simplification or truncation', () => {
  const saved = course(); saved.snapshot.route = Array.from({ length: COURSE_POINTS_MAX }, (_, i) => [127 + i / 1e6, 37]);
  saved.snapshot.route[100] = [...saved.snapshot.route[99]];
  const result = courseGpx(saved);
  assert.deepEqual(points(result.xml), saved.snapshot.route);
  fs.writeFileSync(path.join(artifacts, 'maximum.gpx'), result.xml);
  saved.snapshot.route.push([127, 37]);
  assert.throws(() => courseGpx(saved), { code: 'validation' });
});

test('export reads the latest persisted name and route, writes UTF-8, and leaves SQLite unchanged', async t => {
  const db = openSqlite(); t.after(() => db.closeAsync()); await migrateDatabase(db);
  const repository = createCourseRepository(db);
  const saved = await repository.save(course().snapshot, '첫 이름');
  await repository.rename(saved.id, '바꾼 이름 & 코스');
  const before = await repository.get(saved.id); let shared = false;
  const exportCourse = createCourseExporter(services({ load: id => repository.get(id),
    write: async (name, xml) => {
      const uri = path.join(artifacts, name); await fs.promises.writeFile(uri, xml, 'utf8');
      return { uri, discard: async () => assert.fail('shared file removed too early') };
    }, share: async (uri, options) => {
      const xml = fs.readFileSync(uri, 'utf8');
      assert.match(xml, /바꾼 이름 &amp; 코스/); assert.deepEqual(points(xml), before.snapshot.route);
      assert.equal(options.mimeType, GPX_MIME_TYPE); assert.equal(options.UTI, 'com.topografix.gpx'); shared = true;
    } }));
  assert.equal(await exportCourse(saved.id), 'closed'); assert.ok(shared);
  assert.deepEqual(await repository.get(saved.id), before);
  await db.runAsync('UPDATE saved_courses SET snapshot_json=? WHERE id=?', '{}', saved.id);
  shared = false; await assert.rejects(exportCourse(saved.id), { code: 'corrupt' }); assert.equal(shared, false);
  await repository.remove(saved.id); await assert.rejects(exportCourse(saved.id), { code: 'missing' });
});

test('unavailable sharing stops before reading or writing and failure messages hide native payloads', async () => {
  const exportCourse = createCourseExporter(services({ isAvailable: async () => false,
    load: async () => assert.fail('must not load'), write: async () => assert.fail('must not write') }));
  await assert.rejects(exportCourse(course().id), /공유를 사용할 수 없어요/);
  assert.doesNotMatch(exportErrorMessage(new Error('private path and coordinates')), /private|coordinates/);
});

test('leaving before export or while loading never writes a file or opens the chooser', async () => {
  const controller = new AbortController(), loading = gate(), started = gate();
  const exportCourse = createCourseExporter(services({ load: async () => { started.resolve(); await loading.promise; return course(); },
    write: async () => assert.fail('must not write'), share: async () => assert.fail('must not share') }));
  const pending = exportCourse(course().id, controller.signal); await started.promise; controller.abort(); loading.resolve();
  assert.equal(await pending, 'cancelled'); assert.equal(await exportCourse(course().id, controller.signal), 'cancelled');
});

test('leaving while writing removes only the unshared file and releases the export lock', async () => {
  const writing = gate(), started = gate(), controller = new AbortController(); let discarded = 0, shared = 0;
  const exportCourse = createCourseExporter(services({ write: async () => {
    started.resolve(); await writing.promise; return { uri: 'file:///one.gpx', discard: async () => { discarded++; } };
  }, share: async () => { shared++; } }));
  const pending = exportCourse(course().id, controller.signal); await started.promise; controller.abort(); writing.resolve();
  assert.equal(await pending, 'cancelled'); assert.equal(discarded, 1); assert.equal(shared, 0);
  assert.equal(await exportCourse(course().id), 'closed'); assert.equal(shared, 1); assert.equal(discarded, 1);
});

test('repeated presses cannot open multiple choosers; dismissing permits a later export', async () => {
  const sharing = gate(), opened = gate(); let count = 0;
  const exportCourse = createCourseExporter(services({ share: async () => { count++; opened.resolve(); await sharing.promise; } }));
  const pending = exportCourse(course().id); await opened.promise;
  await assert.rejects(exportCourse(course().id), /이미 GPX/); assert.equal(count, 1);
  sharing.resolve(); assert.equal(await pending, 'closed');
  assert.equal(await exportCourse(course().id), 'closed'); assert.equal(count, 2);
});

test('write and share errors allow retry without reporting success or removing handed-off files', async () => {
  for (const stage of ['write', 'share']) {
    let fail = true;
    const exportCourse = createCourseExporter(services({ write: async () => {
      if (fail && stage === 'write') throw new Error('disk full');
      return { uri: 'file:///one.gpx', discard: async () => assert.fail('potential receiver may still read') };
    }, share: async () => { if (fail) throw new Error('native share failure'); } }));
    await assert.rejects(exportCourse(course().id)); fail = false;
    assert.equal(await exportCourse(course().id), 'closed');
  }
});
