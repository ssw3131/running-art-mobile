// Real isolated Auth/RPC fixture preparation. Never import this into the app.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedSupabase } from './isolated-supabase.mjs';
import { createMembershipRemote } from '../../src/modules/membership/remote.ts';

export const ANDROID_API = 'https://localhost:54431';
export const ANDROID_KEY = 'sb_publishable_isolated_ci';
const folder = resolve('.cache/qa-membership');
const statePath = resolve(folder, 'private-state.json');
const must = (result, description) => { assert.equal(result.error, null, description); return result.data; };
const persist = state => writeFile(statePath, JSON.stringify(state), { mode: 0o600 });

export async function membershipFixture(command, role = 'service', output = '.cache/emulator-auth/session.json') {
  const { admin, client } = isolatedSupabase();
  let state;
  if (command === 'prepare') {
    await mkdir(folder, { recursive: true });
    state = { schema: 'runpen-isolated-membership-v1', run: randomUUID(), users: [], accounts: {}, policy: '' };
    state.policy = `runpen-test-android-${state.run}`;
    await writeFile(statePath, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
    // Refuse pre-existing publications; never deactivate somebody else's policy.
    const active = must(await admin.from('membership_policies').select('id').eq('active', true), 'Read isolated active policy');
    assert.equal(active.length, 0, 'Use a fresh, exclusive runpen-ci stack with no active policy');
    must(await admin.from('membership_policies').insert({ id: state.policy, terms_body: '격리 Android 가입 검사 전용 이용약관. 운영 약관이 아닙니다.',
      privacy_body: '격리 Android의 일회용 합성 계정 검사에 동의합니다.', active: true }), 'Create isolated policy');
    must(await admin.from('service_policies').insert(['privacy', 'location'].map(kind => ({ id: `${state.policy}-${kind}`, kind,
      body: '격리 Android 검사 전용 정책. 운영 문서가 아닙니다.', effective_at: new Date().toISOString(), published: true }))), 'Create isolated policy viewers');
  } else {
    state = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(state.schema, 'runpen-isolated-membership-v1');
    assert.match(state.run, /^[a-f0-9-]{36}$/);
    assert.equal(state.policy, `runpen-test-android-${state.run}`);
  }
  const createAccount = async name => {
    const email = `qa-android-${randomUUID()}@example.invalid`, password = randomUUID() + 'Aa!9';
    // Persist intended identity before the request so cleanup can recover a lost response.
    const record = { email, password, owner: null }; state.users.push(record); await persist(state);
    const result = must(await admin.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: { runpen_qa_run: state.run }, user_metadata: { runpen_nickname: '러너' } }), 'Create isolated Auth account');
    record.owner = result.user.id; state.accounts[name] = record; await persist(state);
    return record;
  };
  const login = async record => {
    assert.ok(record && /^qa-android-[a-f0-9-]+@example\.invalid$/.test(record.email), 'Fixture identity required');
    const c = client();
    const data = must(await c.auth.signInWithPassword({ email: record.email, password: record.password }), 'Sign in isolated fixture');
    assert.equal(data.user.id, record.owner);
    assert.equal(data.user.app_metadata.runpen_qa_run, state.run);
    return { c, session: data.session, remote: createMembershipRemote(c) };
  };
  if (command === 'prepare') {
    const record = await createAccount('service');
    const { c, remote } = await login(record);
    // Service/home fixture: real profile write and explicit synthetic consent RPC.
    // This is setup, not evidence that the Android signup UI passed.
    must(await c.auth.updateUser({ data: { runpen_nickname: '러너', runpen_picture: 'initials' } }), 'Save fixture profile');
    const receipt = await remote.accept({ owner: record.owner, policyId: state.policy, terms: true, privacy: true, requestId: randomUUID() });
    assert.equal(receipt.policyId, state.policy); assert.ok(receipt.completedAt);
    must(await c.auth.signOut({ scope: 'local' }), 'Sign out fixture preparation session');
  } else if (command === 'new-signup') {
    const record = await createAccount('signup');
    const { c, remote } = await login(record);
    assert.equal((await remote.membership(record.owner)).completedAt, null);
    must(await c.auth.signOut({ scope: 'local' }), 'Sign out pending fixture preparation session');
  } else if (command === 'session' || command === 'assert-complete') {
    assert.ok(['signup', 'service'].includes(role));
    const record = state.accounts[role];
    const { c, session, remote } = await login(record);
    const receipt = await remote.membership(record.owner);
    if (role === 'service' || command === 'assert-complete') {
      assert.equal(receipt.policyId, state.policy); assert.ok(receipt.completedAt);
      const consents = must(await c.from('membership_consents').select('request_id').eq('owner_id', record.owner).eq('policy_id', state.policy), 'Read explicit consent');
      assert.ok(consents.length > 0);
    } else assert.equal(receipt.completedAt, null, 'Signup scenario must start pending');
    if (command === 'session') {
      const target = resolve(output);
      assert.ok(target.startsWith(resolve('.cache') + '/') || target.startsWith(resolve('.cache') + '\\'), 'Keep sessions under ignored .cache');
      await mkdir(resolve(target, '..'), { recursive: true });
      const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
      const issuer = new URL(claims.iss);
      assert.ok(['localhost', '127.0.0.1'].includes(issuer.hostname) && issuer.protocol === 'http:' && issuer.port === '54321' && issuer.pathname === '/auth/v1');
      await writeFile(target, JSON.stringify({ fixture: 'runpen-isolated-membership-v1', projectUrl: ANDROID_API, run: state.run, role, issuer: claims.iss, session }), { mode: 0o600 });
      // Do not revoke the handed-off session. The app needs this real JWT/refresh token.
    } else must(await c.auth.signOut({ scope: 'local' }), 'Sign out verification session');
  } else if (command === 'cleanup') {
    // Find only this run's planned emails, including successful requests with lost responses.
    const planned = new Set(state.users.map(user => user.email));
    let page = 1;
    const owned = [];
    for (;;) {
      const data = must(await admin.auth.admin.listUsers({ page: page++, perPage: 1000 }), 'List isolated fixture users');
      owned.push(...data.users.filter(user => planned.has(user.email) && user.app_metadata?.runpen_qa_run === state.run));
      if (data.users.length < 1000) break;
    }
    for (const user of owned) must(await admin.auth.admin.deleteUser(user.id), 'Delete this run fixture user');
    must(await admin.from('service_policies').delete().in('id', [`${state.policy}-privacy`, `${state.policy}-location`]), 'Delete isolated viewer policies');
    must(await admin.from('membership_policies').delete().eq('id', state.policy), 'Delete isolated membership policy');
    await unlink(statePath);
  } else throw Error('Use prepare, new-signup, session, assert-complete or cleanup');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  membershipFixture(...process.argv.slice(2)).then(() => console.log('Isolated membership fixture operation finished; credentials were not printed.'))
    .catch(() => { console.error('Isolated membership fixture operation failed. Keep private-state.json for cleanup; no credentials are printed.'); process.exitCode = 1; });
}
