import { RunShareError, validToken, validateSharedRun, type SharedRun } from './model.ts';

export interface RunShareRemote {
  current(id: string): Promise<string | null>;
  publish(id: string, snapshot: SharedRun): Promise<string>;
  revoke(id: string): Promise<void>;
}
export function createRunShareRemote(deps: { url: string; key: string; token: string; fetch: typeof fetch }): RunShareRemote {
  const endpoint = new URL(deps.url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('Invalid sharing API');
  async function rpc(name: string, id: string, snapshot?: SharedRun) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new RunShareError('러닝 기록 주소가 올바르지 않아요.');
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 30000);
    try {
      const response = await deps.fetch(`${endpoint.origin}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { apikey: deps.key, Authorization: `Bearer ${deps.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_run_id: id, ...(snapshot ? { p_snapshot: validateSharedRun(snapshot) } : {}) }),
        signal: abort.signal, redirect: 'error',
      });
      if (response.status === 401 || response.status === 403) throw new RunShareError('같은 계정으로 로그인한 뒤 다시 시도해 주세요.');
      if (response.status === 404) throw new RunShareError('링크 공유 서비스를 아직 이용할 수 없어요.');
      if (!response.ok) throw new RunShareError('공유 상태를 확인하지 못했어요. 기록 동기화를 확인한 뒤 다시 시도해 주세요.');
      if (name === 'revoke_run_share') return null;
      const raw = await response.text();
      if (raw.length > 1024) throw new Error('Invalid share response');
      const value = JSON.parse(raw) as { token?: unknown } | null;
      if (!value || (value.token !== null && !validToken(value.token))) throw new Error('Invalid share token');
      return value.token as string | null;
    } finally { clearTimeout(timer); }
  }
  return {
    current: id => rpc('get_run_share', id),
    publish: async (id, snapshot) => {
      const token = await rpc('publish_run_share', id, snapshot);
      if (!token) throw new RunShareError('공유 링크를 확인하지 못했어요. 다시 시도해 주세요.');
      return token;
    },
    revoke: async id => { await rpc('revoke_run_share', id); },
  };
}
