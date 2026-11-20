import type { SupabaseClient } from '@supabase/supabase-js';
import { parseNotices } from './content.ts';
import { validateInquiry, type Inquiry, type InquiryCursor, type InquiryInput, type InquiryPage, type InquiryReceipt } from './model.ts';

// Promise.race also bounds a stalled auth refresh, which AbortSignal alone cannot stop.
export async function inquiryRequest<T>(run: (signal: AbortSignal) => PromiseLike<T>, timeout = 10_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error('Inquiry request timed out')); controller.abort(); }, timeout);
    })]);
  } finally { clearTimeout(timer); }
}

export function createSupportRemote(client: Pick<SupabaseClient, 'rpc'>) {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await inquiryRequest(signal => client.rpc(name, args).abortSignal(signal));
    if (error) throw error;
    return data;
  }
  return {
    async notices() {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      // A stalled auth/transport must not prevent the last-good cache fallback.
      // The deadline also covers transports that ignore cancellation.
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Notice request timed out'));
          controller.abort();
        }, 10_000);
      });
      try {
        const { data, error } = await Promise.race([
          client.rpc('get_service_notices').abortSignal(controller.signal),
          deadline,
        ]);
        if (error) throw error;
        return parseNotices(data);
      } finally {
        clearTimeout(timer);
      }
    },
    async submit(owner: string, requestId: string, input: InquiryInput): Promise<InquiryReceipt> {
      const valid = validateInquiry(input);
      const data = await rpc('submit_service_inquiry', {
        p_owner: owner, p_request_id: requestId, p_category: valid.category,
        p_title: valid.title, p_body: valid.body,
      });
      if (data?.deleted === true) throw { code: 'P0002', message: 'Inquiry missing' };
      if (!data || data.id !== requestId || typeof data.receivedAt !== 'string' || !Number.isFinite(Date.parse(data.receivedAt))) throw new Error('Invalid inquiry receipt');
      return { id: data.id, receivedAt: data.receivedAt };
    },
    async list(cursor: InquiryCursor | null = null): Promise<InquiryPage> {
      const data = await rpc('list_service_inquiries', { p_before_at: cursor?.receivedAt ?? null, p_before_id: cursor?.id ?? null });
      if (!data || !Array.isArray(data.items) || data.items.length > 20) throw new Error('Invalid inquiry list');
      return data;
    },
    async detail(id: string): Promise<Inquiry> {
      const data = await rpc('get_service_inquiry', { p_request_id: id });
      if (!data || data.id !== id || !Number.isInteger(data.version) || !Number.isFinite(Date.parse(data.receivedAt))) throw new Error('Invalid inquiry');
      validateInquiry(data);
      return data;
    },
    async update(id: string, version: number, input: InquiryInput): Promise<void> {
      const valid = validateInquiry(input);
      await rpc('update_service_inquiry', { p_request_id: id, p_version: version, p_category: valid.category, p_title: valid.title, p_body: valid.body });
    },
    async remove(id: string, version: number): Promise<void> {
      await rpc('delete_service_inquiry', { p_request_id: id, p_version: version });
    },
  };
}
