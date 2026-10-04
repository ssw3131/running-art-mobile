import { fetch as expoFetch } from 'expo/fetch';
import { accountSecureStorage, authentication, authClient } from '../auth/runtime';
import { authConfig } from '../auth/config';
import { getStorage } from '../storage/database';
import { personalSync } from '../sync/runtime';
import { createWithdrawalController } from './withdrawal';
import { createWithdrawalRemote, WithdrawalError, type WithdrawalRemote } from './withdrawal-remote';

const config = authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const unavailable = async (): Promise<never> => { throw new WithdrawalError('회원 탈퇴 연결 설정을 확인하지 못했어요. 기기 자료는 유지됩니다.'); };
const remote: WithdrawalRemote = config && authClient ? createWithdrawalRemote({
  ...config, fetch: expoFetch as unknown as typeof fetch,
  token: async owner => {
    const session = await authClient?.auth.getSession();
    if (!session || session.error || session.data.session?.user.id !== owner || authentication.getSnapshot().account?.id !== owner) throw new WithdrawalError('탈퇴를 요청한 계정으로 다시 로그인해 주세요.');
    return session.data.session.access_token;
  },
}) : { prepare: unavailable, remove: unavailable, status: unavailable };
export const accountWithdrawal = createWithdrawalController({
  available: !!authClient && process.env.EXPO_PUBLIC_ACCOUNT_DELETION_ENABLED === 'true',
  storage: accountSecureStorage, remote,
  repository: async () => (await getStorage()).withdrawal,
  currentOwner: () => authentication.getSnapshot().account?.id ?? null,
  exclusive: async work => {
    try { await authentication.withAccountOperation(work); }
    finally { personalSync.release(); }
  },
  quiesceSync: () => personalSync.hold(),
  clearSession: owner => authentication.clearDeletedSession(owner),
});
