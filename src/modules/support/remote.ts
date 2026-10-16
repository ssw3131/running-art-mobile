import type { SupabaseClient } from '@supabase/supabase-js';
import { parseNotices } from './content.ts';
import { validateInquiry, type InquiryInput, type InquiryReceipt } from './model.ts';

export function createSupportRemote(client: Pick<SupabaseClient, 'rpc'>) {
  return {
    async notices() {
      const { data, error } = await client.rpc('get_service_notices');
      if (error) throw error;
      return parseNotices(data);
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
