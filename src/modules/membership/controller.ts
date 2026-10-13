import type { AuthState } from '../auth/controller.ts';
import type { StringStorage } from '../auth/secure-storage.ts';
import { consentValid, type ConsentInput, type ConsentRequest, type Membership, type MembershipPolicy } from './model.ts';
import type { MembershipRemote } from './remote.ts';

export type MembershipState = {
  owner: string | null; status: 'idle' | 'loading' | 'unavailable' | 'required' | 'complete' | 'error';
  policy: MembershipPolicy | null; membership: Membership | null; busy: boolean; message: string;
};
type AuthSource = { getSnapshot(): AuthState; subscribe(listener: () => void): () => void };
export function createMembershipController(deps: { auth: AuthSource; remote: MembershipRemote | null; storage: StringStorage; uuid(): string }) {
  let state: MembershipState = { owner: null, status: 'idle', policy: null, membership: null, busy: false, message: '' };
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined, epoch = 0;
  let scope: string | null | undefined;
  const update = (patch: Partial<MembershipState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const ownerNow = () => deps.auth.getSnapshot().account?.id ?? null;
  const current = (owner: string, generation: number) => epoch === generation && ownerNow() === owner;
  const pendingKey = (owner: string) => `runpen.membership.pending.${owner}`;
  const reload = async () => {
    if (state.busy) return;
    const owner = ownerNow();
    const generation = ++epoch;
    update({ owner, status: owner ? 'loading' : 'idle', policy: null, membership: null, message: '', busy: false });
    if (!owner) return;
    if (!deps.remote) { update({ status: 'unavailable' }); return; }
    try {
      const policy = await deps.remote.policy();
      if (!current(owner, generation)) return;
      if (!policy) { update({ status: 'unavailable', message: '가입 약관을 준비하고 있어요. 기존 기능은 계속 이용할 수 있어요.' }); return; }
      const membership = await deps.remote.membership(owner);
      if (!current(owner, generation)) return;
      update({ policy, membership, status: membership?.policyId === policy.id && !!membership.completedAt ? 'complete' : 'required' });
    } catch {
      if (current(owner, generation)) update({ status: 'error', message: '가입 상태를 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.' });
    }
  };
  const observe = () => {
    const auth = deps.auth.getSnapshot();
    const next = auth.ready ? auth.account?.id ?? null : undefined;
    if (next === scope) return;
    scope = next;
    // Account changes immediately clear the previous owner's policy, receipt and errors.
    epoch++;
    update({ owner: next ?? null, status: 'idle', policy: null, membership: null, busy: false, message: '' });
    if (next) void reload();
  };
  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { if (!unsubscribe) { unsubscribe = deps.auth.subscribe(observe); observe(); } },
    stop() { unsubscribe?.(); unsubscribe = undefined; scope = undefined; epoch++; },
    reload,
    async accept(input: ConsentInput): Promise<boolean> {
      const owner = ownerNow(), policy = state.policy;
      if (!owner || owner !== state.owner || state.busy || !deps.remote || !policy || !consentValid(input, policy) || !['required', 'complete'].includes(state.status)) return false;
      const generation = ++epoch;
      update({ busy: true, message: '' });
      try {
        const raw = await deps.storage.getItem(pendingKey(owner));
        let previous: ConsentRequest | null = null;
        try { previous = raw ? JSON.parse(raw) as ConsentRequest : null; } catch { /* Invalid local drafts never grant consent. */ }
        const request: ConsentRequest = previous?.owner === owner && previous.policyId === input.policyId && previous.terms === true && previous.privacy === true
          && typeof previous.requestId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(previous.requestId)
          ? previous : { owner, ...input, requestId: deps.uuid() };
        await deps.storage.setItem(pendingKey(owner), JSON.stringify(request));
        if (!current(owner, generation)) return false;
        const membership = await deps.remote.accept(request);
        if (!current(owner, generation)) return false;
        // Recheck the active version. A policy may change while a request is in flight.
        const latest = await deps.remote.policy();
        if (!current(owner, generation)) return false;
        if (!latest || membership.policyId !== latest.id || !membership.completedAt) {
          update({ policy: latest, membership, status: latest ? 'required' : 'unavailable', message: '가입 약관이 변경되었어요. 내용을 확인하고 다시 동의해 주세요.' });
          return false;
        }
        update({ policy: latest, membership, status: 'complete', message: '가입 절차를 완료했어요.' });
        await deps.storage.removeItem(pendingKey(owner)).catch(() => undefined);
        return current(owner, generation);
      } catch (error) {
        if (current(owner, generation) && (error as { code?: string })?.code === '22023') {
          try {
            const latest = await deps.remote.policy();
            if (current(owner, generation) && latest?.id !== policy.id) {
              update({ policy: latest, status: latest ? 'required' : 'unavailable', message: '가입 약관이 변경되었어요. 내용을 확인하고 다시 동의해 주세요.' });
              return false;
            }
          } catch { /* Keep the unconfirmed request for explicit retry. */ }
        }
        if (current(owner, generation)) update({ message: '가입 완료를 확인하지 못했어요. 입력은 유지돼요. 다시 시도해 주세요.' });
        return false;
      } finally { if (current(owner, generation)) update({ busy: false }); }
    },
  };
}
