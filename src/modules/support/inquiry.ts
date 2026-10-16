import type { StringStorage } from '../auth/secure-storage.ts';
import { InquiryValidationError, validateInquiry, type InquiryInput, type InquiryReceipt } from './model.ts';

type Request = { owner: string; id: string; input: InquiryInput };
type State = { ready: boolean; busy: boolean; pending: Request | null; receipt: InquiryReceipt | null; message: string };
export function createInquiryController(deps: {
  owner: string; currentOwner(): string | null; storage: StringStorage; uuid(): string;
  send(owner: string, id: string, input: InquiryInput): Promise<InquiryReceipt>;
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
        if (pending) pending.input = validateInquiry(pending.input);
        set({ ready: true, pending });
      } catch { if (current()) set({ message: '이전에 보낸 문의를 확인하지 못했어요. 다시 불러와 주세요.' }); }
      finally { set({ busy: false }); }
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
        if (current()) set({ message: state.pending ? '접수 결과를 확인하지 못했어요. 다시 확인하면 같은 문의의 접수 여부를 확인합니다.' : error instanceof InquiryValidationError ? error.message : '문의 준비에 실패했어요. 다시 시도해 주세요.' });
      } finally { set({ busy: false }); }
    },
    newInquiry() { if (current() && !state.busy && !state.pending) set({ receipt: null, message: '' }); },
  };
}
