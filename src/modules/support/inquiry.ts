import type { StringStorage } from '../auth/secure-storage.ts';
import { definiteInquiryRejection, inquiryError, validateInquiry, type InquiryInput, type InquiryReceipt } from './model.ts';

type Request = { owner: string; id: string; input: InquiryInput };
type State = { ready: boolean; busy: boolean; pending: Request | null; receipt: InquiryReceipt | null; message: string };
export function createInquiryController(deps: {
  owner: string; currentOwner(): string | null; storage: StringStorage; uuid(): string;
  send(owner: string, id: string, input: InquiryInput): Promise<InquiryReceipt>;
  lookup(id: string): Promise<InquiryReceipt>;
}) {
  const key = `runpen.inquiry.${deps.owner}`, listeners = new Set<() => void>();
  let state: State = { ready: false, busy: false, pending: null, receipt: null, message: '' };
  const current = () => deps.currentOwner() === deps.owner;
  const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    async load() {
      if (state.busy || !current()) return;
      set({ busy: true, message: '' });
      try {
        const raw = await deps.storage.getItem(key);
        if (!current()) return;
        const pending = raw ? JSON.parse(raw) as Request : null;
        if (pending && (pending.owner !== deps.owner || !/^[a-f0-9-]{36}$/i.test(pending.id))) throw new Error('Invalid pending inquiry');
        if (pending) {
          pending.input = validateInquiry(pending.input);
          // Rewrite legacy copies without contact email before any network request.
          await deps.storage.setItem(key, JSON.stringify(pending));
          if (!current()) return;
        }
        set({ ready: true, pending });
        if (pending) {
          // Recover a lost acknowledgement without sending another message.
          // Missing/deleted/offline responses are not proof that a send failed.
          try {
            const receipt = await deps.lookup(pending.id);
            if (!current()) return;
            if (receipt.id !== pending.id || !Number.isFinite(Date.parse(receipt.receivedAt))) throw new Error('Invalid receipt');
            await deps.storage.removeItem(key);
            if (current()) set({ pending: null, message: '이전 문의가 접수된 것을 확인했어요. 새 문의를 작성할 수 있어요.' });
          } catch {
            if (current()) set({ message: '이전 문의의 접수 결과를 확인하지 못했어요. 같은 문의를 다시 확인하거나 새 문의를 작성할 수 있어요.' });
          }
        }
      } catch { if (current()) set({ message: '이전에 보낸 문의를 확인하지 못했어요. 다시 불러와 주세요.' }); }
      finally { set({ busy: false }); }
    },
    async discardPending() {
      if (state.busy || !state.pending || !current()) return false;
      set({ busy: true });
      try {
        // Explicit user choice only. This removes the local retry copy, never
        // the server inquiry or its idempotency ledger.
        await deps.storage.removeItem(key);
        if (!current()) return false;
        set({ pending: null, receipt: null, message: '' });
        return true;
      } catch {
        if (current()) set({ message: '이전 문의의 임시 저장을 정리하지 못했어요. 다시 시도해 주세요.' });
        return false;
      } finally { set({ busy: false }); }
    },
    async submit(input: InquiryInput) {
      if (state.busy || !state.ready || !current()) return;
      set({ busy: true, message: '' });
      try {
        const pending = state.pending ?? { owner: deps.owner, id: deps.uuid(), input: validateInquiry(input) };
        set({ pending });
        // Persist before sending, then reuse this exact request after uncertain outcomes/restarts.
        await deps.storage.setItem(key, JSON.stringify(pending));
        if (!current()) return;
        const receipt = await deps.send(pending.owner, pending.id, pending.input);
        if (!current()) return;
        if (receipt.id !== pending.id || !Number.isFinite(Date.parse(receipt.receivedAt))) throw new Error('Invalid receipt');
        await deps.storage.removeItem(key);
        if (current()) set({ pending: null, receipt, message: '문의를 접수했어요.' });
      } catch (error) {
        if (current() && definiteInquiryRejection(error)) {
          try { await deps.storage.removeItem(key); if (current()) set({ pending: null }); } catch { /* Keep the exact request if cleanup failed. */ }
        }
        if (current()) set({ message: state.pending ? `${inquiryError(error)} 접수 결과를 확인하지 못했어요. 같은 문의로 다시 확인해 주세요.` : inquiryError(error) });
      } finally { set({ busy: false }); }
    },
    newInquiry() { if (current() && !state.busy && !state.pending) set({ receipt: null, message: '' }); },
  };
}
