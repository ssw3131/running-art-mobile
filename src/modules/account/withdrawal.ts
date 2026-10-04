import type { StringStorage } from '../auth/secure-storage.ts';
import { ownerId } from '../sync/ownership.ts';
import { StorageError } from '../storage/types.ts';
import type { WithdrawalRepository } from './withdrawal-repository.ts';
import { WithdrawalError, type WithdrawalRemote } from './withdrawal-remote.ts';

export const WITHDRAWAL_KEY = 'running-art-withdrawal-v1';
type Intent = { version: 1; owner: string; receipt: string; expiresAt: number; confirmedAt: number };
type State = { ready: boolean; busy: boolean; pending: boolean; owner: string | null; complete: boolean; available: boolean; message: string };
function parseIntent(raw: string | null): Intent | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Intent;
  if (!value || value.version !== 1 || !ownerId(value.owner) || typeof value.receipt !== 'string' || !value.receipt || value.receipt.length > 1500 || !Number.isSafeInteger(value.expiresAt) || !Number.isSafeInteger(value.confirmedAt)) throw new Error('Invalid withdrawal intent');
  return value;
}
export function createWithdrawalController(deps: {
  available: boolean; storage: StringStorage; repository(): Promise<WithdrawalRepository>;
  remote: WithdrawalRemote; currentOwner(): string | null;
  exclusive(work: () => Promise<void>): Promise<void>;
  quiesceSync(): Promise<void>; clearSession(owner: string): Promise<void>;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let state: State = { ready: false, busy: false, pending: false, owner: null, complete: false, available: deps.available, message: '' };
  let intent: Intent | null = null, initialization: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const message = (error: unknown) => error instanceof WithdrawalError || error instanceof StorageError ? error.message : '탈퇴 처리 상태를 저장하거나 확인하지 못했어요. 기기 자료는 유지됩니다. 다시 확인해 주세요.';
  const start = () => initialization ??= (async () => {
    intent = parseIntent(await deps.storage.getItem(WITHDRAWAL_KEY));
    update({ ready: true, pending: !!intent, owner: intent?.owner ?? null });
  })().catch(error => { initialization = null; update({ ready: false, message: message(error) }); });
  const save = async (value: Intent) => {
    await deps.storage.setItem(WITHDRAWAL_KEY, JSON.stringify(value));
    // Verify durable read-back before sending any destructive request.
    const persisted = parseIntent(await deps.storage.getItem(WITHDRAWAL_KEY));
    if (JSON.stringify(persisted) !== JSON.stringify(value)) throw new Error('Withdrawal intent not persisted');
    intent = value; update({ pending: true, owner: value.owner, complete: false });
  };
  const finish = async (value: Intent, repository: WithdrawalRepository) => {
    await repository.retainAsGuest(value.owner);
    await deps.clearSession(value.owner);
    // SQLite's retained marker makes cleanup retries safe after receipt expiry.
    await deps.storage.removeItem(WITHDRAWAL_KEY);
    intent = null;
    update({ pending: false, owner: null, complete: true, message: '탈퇴가 완료되었어요. 이 기기의 코스와 러닝 기록은 비로그인 기록으로 보관했습니다.' });
  };
  async function proceed(value: Intent, repository: WithdrawalRepository) {
    if (deps.currentOwner() !== value.owner) throw new WithdrawalError('탈퇴를 요청한 계정으로 다시 로그인해 주세요. 다른 계정과 기기 자료는 변경하지 않습니다.');
    if (!deps.available) throw new WithdrawalError('회원 탈퇴 서비스를 아직 이용할 수 없어요. 기존 요청과 기기 자료는 유지됩니다.');
    await repository.begin(value.owner);
    const result = await deps.remote.remove(value.owner, value.receipt);
    if (result === 'deleted') await finish(value, repository);
    else update({ message: '서버 자료를 정리하고 있어요. 아래 버튼으로 이어서 처리해 주세요. 기기 기록은 그대로 남습니다.' });
  }
  async function run(work: () => Promise<void>) {
    if (state.busy) return;
    update({ busy: true, message: '' });
    try {
      await start();
      if (!state.ready) return;
      await deps.exclusive(async () => { await deps.quiesceSync(); await work(); });
    } catch (error) {
      // A failed read-back can occur after the secure write succeeded. Reload it
      // on retry; never replace the earlier confirmed intent with another owner.
      initialization = null;
      update({ message: message(error) });
    } finally { update({ busy: false }); }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start,
    begin: () => run(async () => {
      if (intent) throw new WithdrawalError('기존 탈퇴 요청부터 확인해 주세요.');
      const owner = deps.currentOwner();
      if (!owner || !deps.available) throw new WithdrawalError('로그인 후 회원 탈퇴 서비스를 이용해 주세요.');
      const prepared = await deps.remote.prepare(owner);
      const value: Intent = { version: 1, owner, ...prepared, confirmedAt: now() };
      await save(value);
      await proceed(value, await deps.repository());
    }),
    resume: () => run(async () => {
      if (!intent) return;
      let value = intent;
      const repository = await deps.repository(), local = await repository.state(value.owner);
      if (local?.retained_at !== null && local?.retained_at !== undefined) { await finish(value, repository); return; }
      if (value.expiresAt * 1000 <= now()) {
        // An expired receipt is never evidence of deletion. Only the same live
        // account can obtain a new one; otherwise retain all local data as-is.
        if (deps.currentOwner() !== value.owner || !deps.available) throw new WithdrawalError('탈퇴 확인 기간이 지났어요. 요청한 계정으로 로그인한 뒤 다시 확인해 주세요. 로그인할 수 없다면 기기 자료를 유지한 채 지원을 요청해 주세요.');
        value = { ...value, ...await deps.remote.prepare(value.owner) };
        await save(value);
      }
      let status: 'deleted' | 'not_deleted';
      try { status = await deps.remote.status(value.receipt); }
      catch (error) {
        if (!(error instanceof WithdrawalError) || error.code !== 'receipt' || deps.currentOwner() !== value.owner || !deps.available) throw error;
        value = { ...value, ...await deps.remote.prepare(value.owner) };
        await save(value);
        status = await deps.remote.status(value.receipt);
      }
      if (status === 'deleted') {
        await finish(value, repository);
        return;
      }
      await proceed(value, repository);
    }),
  };
}
