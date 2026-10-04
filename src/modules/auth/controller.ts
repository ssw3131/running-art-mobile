import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AUTH_PENDING_KEY, AUTH_REDIRECT_URL, parseAuthCallback } from './config.ts';
import type { StringStorage } from './secure-storage.ts';
import { profileImageUrl, validateProfile, type ProfileInput } from '../account/model.ts';
import { StorageError } from '../storage/types.ts';
import { isSignInProvider, oauthRequest, signInProviderLabels, type SignInProvider } from './providers.ts';

type AuthApi = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithOAuth' | 'exchangeCodeForSession' | 'signOut' | 'startAutoRefresh' | 'stopAutoRefresh' | 'updateUser'>;
type BrowserResult = { type: string; url?: string };
export type Account = { id: string; email: string; name: string; picture: 'provider' | 'initials'; avatarUrl: string | null; providers: string[] };
export type AuthState = { ready: boolean; configured: boolean; busy: boolean; account: Account | null; message: string; providers: readonly SignInProvider[] };
type Pending = { createdAt: number; flowId?: string; provider?: SignInProvider };
const SIGN_IN_ERROR = '로그인을 완료하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';

function accountFrom(session: Session | null): Account | null {
  if (!session) return null;
  const metadata = session.user.user_metadata ?? {};
  const name: unknown = metadata.runpen_nickname ?? metadata.full_name ?? metadata.name ?? metadata.preferred_username ?? metadata.nickname;
  const providers = [...new Set((session.user.identities ?? []).map(identity => identity.provider))];
  return { id: session.user.id, email: session.user.email ?? '', name: typeof name === 'string' && name.trim() ? name : '러너',
    picture: metadata.runpen_picture === 'initials' ? 'initials' : 'provider',
    avatarUrl: profileImageUrl(metadata.avatar_url ?? metadata.picture), providers };
}

export function createAuthController(deps: {
  auth: AuthApi | null;
  storage: StringStorage;
  openBrowser: (url: string, redirect: string) => Promise<BrowserResult>;
  now?: () => number;
  canChangeAccount?: () => Promise<boolean>;
  providers?: readonly SignInProvider[];
}) {
  const { auth, storage } = deps;
  const providers = Object.freeze([...new Set((deps.providers ?? ['google']).filter(isSignInProvider))]);
  let state: AuthState = { ready: !auth, configured: !!auth, busy: false, account: null, message: '', providers };
  const listeners = new Set<() => void>();
  let initialize: Promise<void> | undefined;
  let observing = false;
  let revision = 0;
  let callback: Promise<void> | null = null;
  let accountOperation = false;
  let lastCallback = '';
  const now = deps.now ?? Date.now;
  const update = (patch: Partial<AuthState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const acceptSession = (session: Session | null) => { revision++; update({ account: accountFrom(session) }); };
  const clearPending = () => storage.removeItem(AUTH_PENDING_KEY);
  const pending = async (): Promise<Pending | null> => {
    const raw = await storage.getItem(AUTH_PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Pending | null;
    if (!value || !Number.isFinite(value.createdAt) || now() < value.createdAt || now() - value.createdAt >= 15 * 60_000) return null;
    // The installed Google-only build did not persist a provider. Keep its pending
    // login compatible, while refusing unknown or newly disabled providers.
    const provider = value.provider ?? 'google';
    if (!isSignInProvider(provider) || !providers.includes(provider) ||
        (value.flowId !== undefined && (typeof value.flowId !== 'string' || !value.flowId || value.flowId.length > 200))) return null;
    return { ...value, provider };
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
    // A stray OAuth callback must not release another account operation's lock.
    if (accountOperation) return Promise.resolve();
    const parsed = parseAuthCallback(url);
    if (!parsed || !auth) return Promise.resolve();
    if (callback) return callback;
    if (lastCallback === url) return Promise.resolve();
    callback = (async () => {
      await start();
      const attempt = await pending();
      // A late callback after cancellation/logout cannot sign the user back in.
      if (!attempt) { update({ message: state.account ? '' : '로그인 요청이 만료되었습니다. 로그인을 다시 시작해 주세요.' }); return; }
      lastCallback = url;
      update({ busy: true, message: '' });
      if ('error' in parsed) {
        update({ message: parsed.error === 'cancelled' ? '로그인을 취소했습니다.' : SIGN_IN_ERROR });
        return;
      }
      const { data, error } = await auth.exchangeCodeForSession(parsed.code, attempt.flowId ? { flowId: attempt.flowId } : undefined);
      if (error || !data.session) throw error ?? new Error('Missing session');
      acceptSession(data.session);
      update({ message: `${signInProviderLabels[attempt.provider ?? 'google']} 로그인되었습니다.` });
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
    withAccountOperation: async (work: () => Promise<void>) => {
      if (!auth || state.busy || callback) throw new StorageError('validation', '다른 계정 처리가 끝난 뒤 다시 시도해 주세요.');
      accountOperation = true;
      update({ busy: true });
      try { await start(); await clearPending(); await work(); }
      finally { accountOperation = false; update({ busy: false }); }
    },
    clearDeletedSession: async (owner: string) => {
      if (!auth) return;
      const current = await auth.getSession();
      if (current.error) throw current.error;
      // Recovery may run while another account is signed in. Never log it out.
      if (current.data.session && current.data.session.user.id !== owner) return;
      if (current.data.session) await auth.signOut({ scope: 'local' });
      const restored = await auth.getSession();
      if (restored.error || restored.data.session?.user.id === owner) throw new Error('Deleted session remains');
      acceptSession(restored.data.session);
      update({ message: '탈퇴가 완료되었어요. 기기의 코스와 러닝 기록은 보관했습니다.' });
    },
    setActive: (active: boolean) => {
      const operation = active ? auth?.startAutoRefresh() : auth?.stopAutoRefresh();
      void operation?.catch(() => { update({ message: '로그인 갱신을 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.' }); });
    },
    saveProfile: async (input: ProfileInput): Promise<boolean> => {
      if (!auth || state.busy || !state.account) return false;
      const owner = state.account.id;
      update({ busy: true, message: '' });
      try {
        const profile = validateProfile(input);
        const { data, error } = await auth.updateUser({ data: { runpen_nickname: profile.nickname, runpen_picture: profile.picture } });
        if (error || data.user?.id !== owner || state.account?.id !== owner) throw new Error('Profile update failed');
        const restored = await auth.getSession();
        if (restored.error || restored.data.session?.user.id !== owner || state.account?.id !== owner) throw new Error('Account changed');
        acceptSession(restored.data.session);
        update({ message: '프로필을 저장했어요.' });
        return true;
      } catch (error) {
        if (state.account?.id === owner) update({ message: error instanceof StorageError ? error.message : '프로필을 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.' });
        return false;
      } finally { update({ busy: false }); }
    },
    signIn: async (provider: SignInProvider = 'google') => {
      if (!auth || state.busy || state.account) return;
      if (!isSignInProvider(provider) || !providers.includes(provider)) { update({ message: '아직 사용할 수 없는 로그인 방식입니다.' }); return; }
      update({ busy: true, message: '' });
      try {
        await start();
        if (state.account) return;
        if (deps.canChangeAccount && !await deps.canChangeAccount()) { update({ message:'진행 중인 러닝을 종료한 뒤 계정을 변경해 주세요.' }); return; }
        lastCallback = '';
        const attempt: Pending = { createdAt: now(), provider };
        await storage.setItem(AUTH_PENDING_KEY, JSON.stringify(attempt));
        const { data, error } = await auth.signInWithOAuth(oauthRequest(provider));
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
        if (deps.canChangeAccount && !await deps.canChangeAccount()) { update({ message:'진행 중인 러닝을 종료한 뒤 로그아웃해 주세요.' }); return; }
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
