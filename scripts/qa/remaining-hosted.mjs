// Live checks restricted to the explicitly approved disposable B account.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { stripJpegMetadata } from '../../src/modules/account/photo.ts';
import { openSqlite } from '../../tests/helpers/sqlite.mjs';
import { migrateDatabase } from '../../src/modules/storage/migrations.ts';
import { createCourseRepository } from '../../src/modules/courses/repository.ts';
import { createRunRepository } from '../../src/modules/running/repository.ts';
import { createSyncRepository } from '../../src/modules/sync/repository.ts';
import { createSyncRemote } from '../../src/modules/sync/remote.ts';
import { synchronize } from '../../src/modules/sync/engine.ts';
const dir = '.cache/remaining-qa';
const credentials = JSON.parse(await fs.readFile('.cache/account-expansion/fixtures.private.json', 'utf8'));
assert.equal(credentials.length, 1);
assert.match(credentials[0].email, /^runpen-photo-\d+-b@example\.invalid$/);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'zymfblgzpidgfjjgrino.supabase.co');
const client = createClient(url, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
});
const login = await client.auth.signInWithPassword(credentials[0]);
assert.equal(login.error, null, 'Disposable sign-in failed');
const user = login.data.user;
assert.equal(user.email, credentials[0].email);
assert.ok(user.identities.every(i => i.provider === 'email'));
if (process.argv[2] === 'photo') {
  const m = user.user_metadata;
  assert.equal(m.runpen_picture, 'uploaded');
  assert.ok(m.runpen_photo_path.startsWith(user.id + '/'));
  const result = await client.storage.from('profile-photos').download(m.runpen_photo_path).asStream();
  assert.equal(result.error, null);
  const bytes = new Uint8Array(await new Response(result.data).arrayBuffer());
  assert.deepEqual(stripJpegMetadata(bytes), bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(m.runpen_photo_path, `${user.id}/${hash}.jpg`);
  await fs.writeFile(`${dir}/native-upload.jpg`, bytes);
  await fs.writeFile(`${dir}/native-photo-report.json`, JSON.stringify({ bytes: bytes.length, hash, metadataStripped: true, checkedAt: new Date().toISOString() }, null, 2));
  console.log('PASS: native JPEG matches immutable path; EXIF/APP/COM/trailing data absent');
} else if (process.argv[2] === 'seed') {
  const existing = await client.from('personal_records').select('record_id,kind,summary').eq('owner_id', user.id);
  assert.equal(existing.error, null); assert.ok(existing.data.length === 0 || existing.data.length === 2);
  assert.ok(existing.data.every(r => r.kind === 'course' ? r.summary.name === 'QA remaining keep' : r.summary.courseName === 'QA remaining keep'));
  const db = openSqlite(); await migrateDatabase(db);
  const owner = user.id, scope = () => owner;
  const courses = createCourseRepository(db, Date.now, scope);
  const repository = createSyncRepository(db, scope); await repository.enable(owner, false);
  const remote = createSyncRemote(client, owner);
  await synchronize({ owner, repository, remote, check: () => {} });
  const snapshot = JSON.parse(await fs.readFile('.cache/free-loop-qa/fixture.json', 'utf8')).snapshot;
  const saved = [];
  for (const name of ['QA remaining keep', 'QA remaining conflict', 'QA remaining delete']) {
    saved.push({ ...await courses.save({ ...snapshot, targetKm: snapshot.targetKm + saved.length * 0.01 }, name), name });
  }
  let now = Date.now() - 60000;
  const syntheticRuns = createRunRepository(db, () => now, scope);
  const [longitude, latitude] = snapshot.route[0];
  let run = existing.data.find(r => r.kind === 'run');
  if (run) run = { id: run.record_id };
  else {
    run = await syntheticRuns.start(saved[0].id, { timestamp: now, longitude, latitude, accuracy: 5 });
    now += 10000;
    await syntheticRuns.append([{ timestamp: now, longitude: longitude + 0.0001, latitude, accuracy: 5 }]);
    await syntheticRuns.transition(run.id, 'completed');
  }
  const stats = await synchronize({ owner, repository, remote, check: () => {} });
  assert.equal(stats.uploaded, existing.data.length ? 2 : 4); assert.equal(stats.conflicts, 0);
  await fs.writeFile(`${dir}/sync-fixture.json`, JSON.stringify({ courses: saved.map(c => ({ id: c.id, name: c.name })), run: run.id }, null, 2));
  await db.closeAsync();
  console.log('PASS: 3 synthetic courses and 1 synthetic run uploaded through production repository/engine');
} else if (process.argv[2] === 'prepare-withdrawal-batches') {
  // Tiny orphaned synthetic payloads force the deployed 500-object batch limit,
  // so the unchanged Android UI must resume its durable withdrawal request.
  const bucket = client.storage.from('personal-records');
  let uploaded = 0;
  for (let start = 0; start < 501; start += 10) {
    await Promise.all(Array.from({ length: Math.min(10, 501-start) }, async (_, offset) => {
      const bytes = new TextEncoder().encode(JSON.stringify({ fixture: 'remaining-withdrawal', index: start+offset }));
      const hash = createHash('sha256').update(bytes).digest('hex');
      const path = `${user.id}/course/${'f'.repeat(32)}/${hash}.json`;
      const { error } = await bucket.upload(path, bytes.buffer, { contentType: 'application/json', upsert: false });
      assert.ok(!error || String(error.statusCode) === '409', 'Synthetic batch upload failed');
      uploaded++;
    }));
  }
  await fs.writeFile(`${dir}/withdrawal-batch.json`, JSON.stringify({ uploaded, checkedAt: new Date().toISOString() }));
  console.log('PASS: 501 tiny synthetic files prepared for native withdrawal resume');
} else throw new Error('Unknown check');
await client.auth.signOut({ scope: 'local' });
