import type { AuthState } from '../auth/controller.ts';
import type { StringStorage } from '../auth/secure-storage.ts';
import { consentValid, parseMembership, type ConsentInput, type ConsentRequest, type Membership, type MembershipPolicy } from './model.ts';
import type { MembershipRemote } from './remote.ts';

export type MembershipState = {
  owner: string | null; status: 'idle' | 'loading' | 'unavailable' | 'required' | 'complete' | 'error';
  policy: MembershipPolicy | null; membership: Membership | null; busy: boolean; message: string;
  policyStatus: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'; policyMessage: string;
  offlineAvailable?: boolean;
};
type AuthSource = { getSnapshot(): AuthState; subscribe(listener: () => void): () => void };
export function createMembershipController(deps: { auth: AuthSource; remote: MembershipRemote | null; storage: StringStorage; uuid(): string }) {
  let state: MembershipState = { owner: null, status: 'idle', policy: null, membership: null, busy: false, message: '', policyStatus: 'idle', policyMessage: '' };
  const listeners = new Set<() => void>();
  let unsubscribe: (() => void) | undefined, epoch = 0;
  let scope: string | null | undefined;
  const update = (patch: Partial<MembershipState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const ownerNow = () => deps.auth.getSnapshot().account?.id ?? null;
  const current = (owner: string, generation: number) => epoch === generation && ownerNow() === owner;
  const pendingKey = (owner: string) => `runpen.membership.pending.${owner}`;
  const receiptKey = (owner: string) => `runpen.membership.receipt.${owner}`;
  const remember = async (owner: string, receipt: Membership) => {
    if (receipt.owner === owner && receipt.completedAt) await deps.storage.setItem(receiptKey(owner), JSON.stringify(receipt)).catch(() => undefined);
  };
  const resolvedStatus = (receipt: Membership | null, policy: MembershipPolicy | null) =>
    policy && receipt?.policyId === policy.id && !!receipt.completedAt ? 'complete' as const : 'required' as const;
  const loadPolicy = async (owner: string, generation: number) => {
    try {
      const policy = await deps.remote!.policy();
      if (current(owner, generation)) update({ policy, policyStatus: policy ? 'ready' : 'unavailable',
        policyMessage: policy ? '' : '가입 약관이 아직 게시되지 않았어요. 프로필을 입력한 뒤 약관을 다시 확인해 주세요.' });
    } catch {
      if (current(owner, generation)) update({ policy: null, policyStatus: 'error', policyMessage: '약관을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.' });
    }
  };
  const reload = async () => {
    if (state.busy) return;
    const owner = ownerNow();
    const generation = ++epoch;
    update({ owner, status: owner ? 'loading' : 'idle', policy: null, membership: null, message: '', busy: false,
      policyStatus: owner ? 'loading' : 'idle', policyMessage: '', offlineAvailable: state.owner === owner && state.offlineAvailable });
    if (!owner) return;
    try {
      const raw = await deps.storage.getItem(receiptKey(owner));
      const cached = raw ? parseMembership(JSON.parse(raw), owner) : null;
      if (current(owner, generation) && cached?.owner === owner && cached.completedAt) update({ offlineAvailable: true });
    } catch { /* Missing/corrupt cached receipts never grant offline access. */ }
    if (!deps.remote) { update({ status: 'error', policyStatus: 'unavailable', message: '가입 연결을 사용할 수 없어요. 앱 설정을 확인해 주세요.' }); return; }
    // Neither failure suppresses the other request. Pending users can edit their
    // profile as soon as their membership is known, even while policy loads.
    await Promise.all([loadPolicy(owner, generation), (async () => {
      try {
        const membership = await deps.remote!.membership(owner);
        if (current(owner, generation)) {
          // Keep a confirmed owner's navigator mounted while policy/receipt
          // requests finish in either order. Only the settled pair decides
          // whether renewed consent is required; pending members remain gated.
          update({ membership, status: membership?.completedAt ? 'loading' : 'required', offlineAvailable: !!membership?.completedAt });
          if (membership?.completedAt) await remember(owner, membership);
          else await deps.storage.removeItem(receiptKey(owner)).catch(() => undefined);
        }
      } catch {
        if (current(owner, generation)) update({ status: 'error', message: '가입 상태를 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.' });
      }
    })()]);
    if (current(owner, generation) && state.status !== 'error') update({ status: resolvedStatus(state.membership, state.policy) });
  };
  const observe = () => {
    const auth = deps.auth.getSnapshot();
    const next = auth.ready ? auth.account?.id ?? null : undefined;
    if (next === scope) return;
    scope = next;
    // Account changes immediately clear the previous owner's policy, receipt and errors.
    epoch++;
    update({ owner: next ?? null, status: 'idle', policy: null, membership: null, busy: false, message: '', policyStatus: 'idle', policyMessage: '', offlineAvailable: false });
    if (next) void reload();
  };
  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { if (!unsubscribe) { unsubscribe = deps.auth.subscribe(observe); observe(); } },
    stop() { unsubscribe?.(); unsubscribe = undefined; scope = undefined; epoch++; },
    reload,
    async retryPolicy() {
      const owner = ownerNow();
      if (!owner || state.owner !== owner || state.busy || !deps.remote || state.policyStatus === 'loading') return;
      const generation = epoch;
      update({ policyStatus: 'loading', policyMessage: '' });
      await loadPolicy(owner, generation);
      if (current(owner, generation) && state.status !== 'error' && state.status !== 'loading') update({ status: resolvedStatus(state.membership, state.policy) });
    },
    async accept(input: ConsentInput, saveProfile?: () => Promise<boolean>): Promise<boolean> {
      const owner = ownerNow(), policy = state.policy;
      if (!owner || owner !== state.owner || state.busy || state.policyStatus !== 'ready' || !deps.remote || !policy || !consentValid(input, policy) || !['required', 'complete'].includes(state.status)) return false;
      const generation = ++epoch;
      update({ busy: true, message: '' });
      let verifyingPolicy = false;
      try {
        // Hold the membership gate across the Auth profile snapshot update.
        // A failed save must never issue a consent request.
        if (saveProfile && !(await saveProfile())) return false;
        if (!current(owner, generation)) return false;
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
        update({ membership });
        // Recheck the active version. A policy may change while a request is in flight.
        verifyingPolicy = true;
        const latest = await deps.remote.policy();
        verifyingPolicy = false;
        if (!current(owner, generation)) return false;
        if (!latest || membership.policyId !== latest.id || !membership.completedAt) {
          update({ policy: latest, policyStatus: latest ? 'ready' : 'unavailable', membership, status: 'required', message: '가입 약관이 변경되었어요. 내용을 확인하고 다시 동의해 주세요.' });
          return false;
        }
        update({ policy: latest, policyStatus: 'ready', membership, status: 'complete', offlineAvailable: true, message: '가입 절차를 완료했어요.' });
        await remember(owner, membership);
        await deps.storage.removeItem(pendingKey(owner)).catch(() => undefined);
        return current(owner, generation);
      } catch (error) {
        if (current(owner, generation) && verifyingPolicy) {
          update({ policy: null, policyStatus: 'error', status: 'required',
            policyMessage: '동의 접수 후 최신 약관 확인에 실패했어요. 약관을 다시 확인해 주세요.', message: '' });
          return false;
        }
        if (current(owner, generation) && (error as { code?: string })?.code === '22023') {
          try {
            const latest = await deps.remote.policy();
            if (current(owner, generation) && latest?.id !== policy.id) {
              update({ policy: latest, policyStatus: latest ? 'ready' : 'unavailable', status: 'required', message: '가입 약관이 변경되었어요. 내용을 확인하고 다시 동의해 주세요.' });
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
