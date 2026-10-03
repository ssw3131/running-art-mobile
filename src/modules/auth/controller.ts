import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AUTH_PENDING_KEY, AUTH_REDIRECT_URL, parseAuthCallback } from './config.ts';
import type { StringStorage } from './secure-storage.ts';

type AuthApi = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithOAuth' | 'exchangeCodeForSession' | 'signOut' | 'startAutoRefresh' | 'stopAutoRefresh'>;
type BrowserResult = { type: string; url?: string };
export type Account = { id: string; email: string; name: string };
export type AuthState = { ready: boolean; configured: boolean; busy: boolean; account: Account | null; message: string };
type Pending = { createdAt: number; flowId?: string };
const SIGN_IN_ERROR = '로그인을 완료하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';

function accountFrom(session: Session | null): Account | null {
  if (!session) return null;
  const name: unknown = session.user.user_metadata?.full_name ?? session.user.user_metadata?.name;
  return { id: session.user.id, email: session.user.email ?? '', name: typeof name === 'string' ? name : 'Google 계정' };
}

export function createAuthController(deps: {
  auth: AuthApi | null;
  storage: StringStorage;
  openBrowser: (url: string, redirect: string) => Promise<BrowserResult>;
  now?: () => number;
}) {
  const { auth, storage } = deps;
  let state: AuthState = { ready: !auth, configured: !!auth, busy: false, account: null, message: '' };
  const listeners = new Set<() => void>();
  let initialize: Promise<void> | undefined;
  let observing = false;
  let revision = 0;
  let callback: Promise<void> | null = null;
  let lastCallback = '';
  const now = deps.now ?? Date.now;
  const update = (patch: Partial<AuthState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const acceptSession = (session: Session | null) => { revision++; update({ account: accountFrom(session) }); };
  const clearPending = () => storage.removeItem(AUTH_PENDING_KEY);
  const pending = async (): Promise<Pending | null> => {
    const raw = await storage.getItem(AUTH_PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Pending;
    return Number.isFinite(value.createdAt) && now() >= value.createdAt && now() - value.createdAt < 15 * 60_000 ? value : null;
  };

  const start = () => {
    if (!auth) return Promise.resolve();
    if (!initialize) {
      // The singleton owns this subscription for the lifetime of the app process.
      if (!observing) {
        observing = true;
        auth.onAuthStateChange((event, session) => {
          acceptSession(session);
          if (event === 'SIGNED_OUT') update({ message: '로그아웃되었습니다.' });
        });
      }
      const before = revision;
      initialize = auth.getSession().then(({ data, error }) => {
        if (error) throw error;
        if (before === revision) acceptSession(data.session);
        update({ ready: true });
      }).catch(() => {
        update({ ready: true, message: '로그인 상태를 복원하지 못했습니다. 인터넷 연결을 확인하고 앱을 다시 열어 주세요.' });
        initialize = undefined;
      });
    }
    return initialize;
  };

  const handleUrl = (url: string): Promise<void> => {
    const parsed = parseAuthCallback(url);
    if (!parsed || !auth) return Promise.resolve();
    if (callback) return callback;
    if (lastCallback === url) return Promise.resolve();
    callback = (async () => {
      await start();
      const attempt = await pending();
      // A late callback after cancellation/logout cannot sign the user back in.
      if (!attempt) { update({ message: state.account ? '' : '로그인 요청이 만료되었습니다. Google 로그인을 다시 시작해 주세요.' }); return; }
      lastCallback = url;
      update({ busy: true, message: '' });
      if ('error' in parsed) {
        update({ message: parsed.error === 'cancelled' ? '로그인을 취소했습니다.' : SIGN_IN_ERROR });
        return;
      }
      const { data, error } = await auth.exchangeCodeForSession(parsed.code, attempt.flowId ? { flowId: attempt.flowId } : undefined);
      if (error || !data.session) throw error ?? new Error('Missing session');
      acceptSession(data.session);
      update({ message: 'Google 로그인되었습니다.' });
    })().catch(() => { update({ message: SIGN_IN_ERROR }); }).finally(async () => {
      try { await clearPending(); } catch { update({ message: '로그인 저장소를 정리하지 못했습니다. 앱을 다시 열어 주세요.' }); }
      update({ busy: false });
      callback = null;
    });
    return callback;
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start,
    handleUrl,
    setActive: (active: boolean) => {
      const operation = active ? auth?.startAutoRefresh() : auth?.stopAutoRefresh();
      void operation?.catch(() => { update({ message: '로그인 갱신을 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.' }); });
    },
    signIn: async () => {
      if (!auth || state.busy || state.account) return;
      update({ busy: true, message: '' });
      try {
        await start();
        lastCallback = '';
        const attempt: Pending = { createdAt: now() };
        await storage.setItem(AUTH_PENDING_KEY, JSON.stringify(attempt));
        const { data, error } = await auth.signInWithOAuth({
          provider: 'google', options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
        });
        if (error || !data.url) throw error ?? new Error('Missing OAuth URL');
        if (new URL(data.url).searchParams.get('code_challenge_method') !== 's256') throw new Error('S256 PKCE required');
        if (data.flowId) attempt.flowId = data.flowId;
        await storage.setItem(AUTH_PENDING_KEY, JSON.stringify(attempt));
        const result = await deps.openBrowser(data.url, AUTH_REDIRECT_URL);
        if (result.type === 'success' && result.url) await handleUrl(result.url);
        else {
          if (callback) await callback;
          if (!state.account) update({ message: '로그인을 취소했습니다.' });
        }
      } catch { update({ message: SIGN_IN_ERROR }); }
      finally {
        if (callback) await callback;
        try { await clearPending(); } catch { update({ message: '로그인 저장소를 정리하지 못했습니다. 앱을 다시 열어 주세요.' }); }
        update({ busy: false });
      }
    },
    signOut: async () => {
      if (!auth || state.busy) return;
      update({ busy: true, message: '' });
      try {
        await start();
        await clearPending();
        const { error } = await auth.signOut({ scope: 'local' });
        // This SDK removes the local session even when remote revocation fails.
        // Check storage-backed SDK state instead of claiming logout on every failure.
        const restored = await auth.getSession();
        if (restored.error || restored.data.session) throw new Error('Session remains');
        acceptSession(null);
        update({ message: error ? '이 기기에서 로그아웃했습니다. 서버의 세션 종료는 확인하지 못했습니다.' : '로그아웃되었습니다.' });
      } catch { update({ message: '로그아웃을 완료하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.' }); }
      finally { update({ busy: false }); }
    },
  };
}
