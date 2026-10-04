export class WithdrawalError extends Error {
  readonly code?: 'receipt';
  constructor(message: string, code?: 'receipt') { super(message); this.code = code; }
}
export type PreparedWithdrawal = { receipt: string; expiresAt: number };
export interface WithdrawalRemote {
  prepare(owner: string): Promise<PreparedWithdrawal>;
  remove(owner: string, receipt: string): Promise<'deleted' | 'deleting'>;
  status(receipt: string): Promise<'deleted' | 'not_deleted'>;
}
export function createWithdrawalRemote(deps: {
  url: string; key: string; fetch: typeof fetch;
  token(owner: string): Promise<string>;
}): WithdrawalRemote {
  const url = new URL(deps.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid account endpoint');
  async function request(body: object, owner?: string): Promise<{ state: string; receipt?: string; expiresAt?: number }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: deps.key };
    if (owner) headers.Authorization = `Bearer ${await deps.token(owner)}`;
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 45000);
    try {
      const response = await deps.fetch(`${url.origin}/functions/v1/delete-account`, { method: 'POST', headers, body: JSON.stringify(body), signal: abort.signal, redirect: 'error' });
      if (response.status === 401 || response.status === 403) throw new WithdrawalError('탈퇴 확인이 만료되었거나 로그인이 필요해요. 같은 계정으로 로그인한 뒤 다시 확인해 주세요.', !owner ? 'receipt' : undefined);
      if (response.status === 404) throw new WithdrawalError('회원 탈퇴 서비스를 아직 이용할 수 없어요. 탈퇴 완료는 확인되지 않았으며 기기 자료는 유지됩니다.');
      if (response.status !== 200 && response.status !== 202) throw new Error('Withdrawal service unavailable');
      const raw = await response.text();
      if (raw.length > 4096) throw new Error('Invalid response size');
      const data = JSON.parse(raw) as { state: string; receipt?: string; expiresAt?: number } | null;
      if (!data || typeof data !== 'object' || (response.status === 202 && data.state !== 'deleting')) throw new Error('Invalid response');
      return data;
    } catch (error) {
      if (error instanceof WithdrawalError) throw error;
      throw new WithdrawalError('탈퇴 완료를 확인하지 못했어요. 기기 자료는 유지됩니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.');
    } finally { clearTimeout(timer); }
  }
  return {
    prepare: async owner => {
      const data = await request({ action: 'prepare' }, owner);
      if (data.state !== 'prepared' || typeof data.receipt !== 'string' || !data.receipt || data.receipt.length > 1500 || !Number.isSafeInteger(data.expiresAt)) throw new WithdrawalError('탈퇴 확인 정보를 받지 못했어요. 잠시 후 다시 시도해 주세요.');
      return { receipt: data.receipt, expiresAt: data.expiresAt! };
    },
    remove: async (owner, receipt) => {
      const data = await request({ action: 'delete', confirmation: 'delete-my-account', receipt }, owner);
      if (data.state !== 'deleted' && data.state !== 'deleting') throw new WithdrawalError('탈퇴 완료를 확인하지 못했어요. 기기 자료는 유지됩니다.');
      return data.state;
    },
    status: async receipt => {
      const data = await request({ action: 'status', receipt });
      if (data.state !== 'deleted' && data.state !== 'not_deleted') throw new WithdrawalError('탈퇴 상태를 확인하지 못했어요. 기기 자료는 유지됩니다.');
      return data.state;
    },
  };
}
