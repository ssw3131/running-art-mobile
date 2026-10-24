import { CalculationCancelled } from '../route-engine/runner.ts';
import { COMPUTE_CONTRACT, CURRENT_COMPUTE_CONTRACT, MAX_RESPONSE_BYTES, parseComputeRequest, parseComputeResponse } from './contract.ts';
import type { SearchInput } from '../route-engine/types.ts';
import type { ComputeResponse } from './contract.ts';
import { AllowanceError, exhaustedMessage } from '../usage/model.ts';

export type RemoteCalculation = (input: SearchInput, signal: AbortSignal, refresh: boolean) => Promise<ComputeResponse>;
export function computeBaseUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || !['/', '/api', '/api/'].includes(url.pathname)) return null;
    return url.origin + (url.pathname === '/' ? '' : '/api');
  } catch { return null; }
}

export function createRemoteCalculation(base: string, fetcher: typeof fetch = fetch, timeoutMs = 75000, authorization?: () => Promise<Record<string,string>>): RemoteCalculation {
  const root = computeBaseUrl(base);
  if (!root) throw new Error('코스 서버 주소를 확인해 주세요.');
  return async (input, signal, refresh) => {
    if (signal.aborted) throw new CalculationCancelled();
    const request = parseComputeRequest({ contract: input.options.shapeVersion ? CURRENT_COMPUTE_CONTRACT : COMPUTE_CONTRACT, origin: input.origin, options: input.options, refresh });
    const controller = new AbortController();
    let rejectInterrupted!: (error: Error) => void;
    const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
    const abort = () => { controller.abort(); rejectInterrupted(new CalculationCancelled()); };
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { controller.abort(); rejectInterrupted(new Error('서버 응답 시간이 초과됐어요.')); }, timeoutMs);
    try {
      return await Promise.race([interrupted, (async () => {
        const headers = authorization ? await authorization() : {};
        const response = await fetcher(`${root}/v1/routes`, { method: 'POST', signal: controller.signal,
          redirect: 'error', credentials: 'omit', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(request) });
        if (response.status === 401 || response.status === 403) throw new AllowanceError('온라인 가입 완료 회원만 코스를 생성할 수 있어요. 로그인과 가입 상태를 확인해 주세요.');
        if ((!response.ok && response.status !== 409) || response.redirected) throw new Error(response.status === 429 || response.status === 503 ? '서버가 혼잡해요.' : '서버에 연결하지 못했어요.');
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
        const value = JSON.parse(text);
        if (response.status === 409) throw new AllowanceError(value?.error === 'generation_exhausted' ? exhaustedMessage : '이전 생성이 취소되었거나 만료됐어요. 다시 생성해 주세요.');
        return parseComputeResponse(value, request);
      })()]);
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); }
  };
}
