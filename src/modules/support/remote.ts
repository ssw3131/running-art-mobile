import type { SupabaseClient } from '@supabase/supabase-js';
import { parseNotices } from './content.ts';
import { validateInquiry, type InquiryInput, type InquiryReceipt } from './model.ts';

export function createSupportRemote(client: Pick<SupabaseClient, 'rpc'>) {
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
      const { data, error } = await client.rpc('submit_service_inquiry', {
        p_owner: owner, p_request_id: requestId, p_category: valid.category,
        p_title: valid.title, p_body: valid.body, p_email: valid.email,
      });
      if (error) throw error;
      if (!data || data.id !== requestId || typeof data.receivedAt !== 'string' || !Number.isFinite(Date.parse(data.receivedAt))) throw new Error('Invalid inquiry receipt');
      return { id: data.id, receivedAt: data.receivedAt };
    },
  };
}
