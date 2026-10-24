import { CalculationCancelled } from '../route-engine/runner.ts';
import { COMPUTE_CONTRACT, MAX_RESPONSE_BYTES, parseComputeRequest, parseComputeResponse } from './contract.ts';
import type { SearchInput } from '../route-engine/types.ts';
import type { ComputeResponse } from './contract.ts';

export type RemoteCalculation = (input: SearchInput, signal: AbortSignal, refresh: boolean) => Promise<ComputeResponse>;
export function computeBaseUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || !['/', '/api', '/api/'].includes(url.pathname)) return null;
    return url.origin + (url.pathname === '/' ? '' : '/api');
  } catch { return null; }
}

export function createRemoteCalculation(base: string, fetcher: typeof fetch = fetch, timeoutMs = 75000): RemoteCalculation {
  const root = computeBaseUrl(base);
  if (!root) throw new Error('코스 서버 주소를 확인해 주세요.');
  return async (input, signal, refresh) => {
    if (signal.aborted) throw new CalculationCancelled();
    const request = parseComputeRequest({ contract: COMPUTE_CONTRACT, origin: input.origin, options: input.options, refresh });
    const controller = new AbortController();
    let rejectInterrupted!: (error: Error) => void;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
    const abort = () => { controller.abort(); rejectInterrupted(new CalculationCancelled()); };
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { controller.abort(); rejectInterrupted(new Error('서버 응답 시간이 초과됐어요.')); }, timeoutMs);
    try {
      return await Promise.race([interrupted, (async () => {
        const response = await fetcher(`${root}/v1/routes`, { method: 'POST', signal: controller.signal,
          redirect: 'error', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
        if (!response.ok || response.redirected) throw new Error(response.status === 429 || response.status === 503 ? '서버가 혼잡해요.' : '서버에 연결하지 못했어요.');
        if (!response.headers.get('content-type')?.startsWith('application/json')) throw new Error('서버 응답 형식이 달라요.');
        const declared = response.headers.get('content-length');
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) throw new Error('서버 응답이 너무 커요.');
        if (!response.body) throw new Error('서버 응답이 비어 있어요.');
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let size = 0, text = '';
        try {
          while (true) {
            if (controller.signal.aborted) throw new CalculationCancelled();
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_RESPONSE_BYTES) throw new Error('서버 응답이 너무 커요.');
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        return parseComputeResponse(JSON.parse(text), request);
      })()]);
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); }
  };
}
