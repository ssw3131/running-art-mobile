import { AllowanceError, assertAllowed, type UsageAccess } from './model.ts';
import { CalculationCancelled } from '../route-engine/runner.ts';
import { parseComputeRequest, parseComputeResponse, COMPUTE_CONTRACT, CURRENT_COMPUTE_CONTRACT } from '../route-compute/contract.ts';
import type { RemoteCalculation } from '../route-compute/client.ts';
export type GenerationJournal = { read():Promise<{id:string;request_json:string;result_json:string|null}|null>; write(id:string,request:string,result:string|null):Promise<void>; clear(id:string):Promise<void> };
export function meteredGeneration(remote: (id:string)=>RemoteCalculation, access: UsageAccess, journal: GenerationJournal): RemoteCalculation {
  return async (input, signal, refresh) => {
    const request = parseComputeRequest({ contract: input.options.shapeVersion ? CURRENT_COMPUTE_CONTRACT : COMPUTE_CONTRACT, origin: input.origin, options: input.options, refresh });
    const json = JSON.stringify(request), previous = await journal.read();
    if (previous && previous.request_json !== json) throw new AllowanceError('이전 생성 결과를 먼저 복원해 주세요. 복원 후 새 조건으로 생성할 수 있어요.');
    const id = previous?.id ?? access.uuid();
    if (signal.aborted) throw new CalculationCancelled();
    await journal.write(id,json,previous?.result_json ?? null);
    let accepting = false;
    try {
      const existing = previous ? await access.command('read',{id}) : null;
      if (existing?.state === 'cancelled') { await journal.clear(id); throw new AllowanceError('이전 생성이 취소됐어요. 다시 생성해 주세요.'); }
      const value = previous?.result_json ? parseComputeResponse(JSON.parse(previous.result_json),request)
        : existing?.result ? parseComputeResponse(existing.result,request) : await remote(id)(input,signal,refresh);
      if (!value.result.candidates.length) { await journal.clear(id); return value; }
      await journal.write(id,json,JSON.stringify(value));
      if (signal.aborted) throw new CalculationCancelled();
      accepting = true;
      const committed = assertAllowed(await access.command('commit',{id}));
      if (committed.state !== 'committed') throw new AllowanceError('생성 결과 확인 중이에요. 다시 복원해 주세요.');
      if (signal.aborted) throw new CalculationCancelled();
      // Keep the receipt until the UI has actually rendered the result. A
      // process death between this return and that render must remain recoverable.
      return value;
    } catch (error) {
      if (!accepting && signal.aborted) {
        try { const cancelled = await access.command('cancel',{id}); if (cancelled?.state !== 'committed') await journal.clear(id); }
        catch { /* Reconcile the durable operation after reconnection. */ }
      }
      throw error;
    }
  };
}
