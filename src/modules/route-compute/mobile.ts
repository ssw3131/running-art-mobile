import { fetch } from 'expo/fetch';
import { computeBaseUrl, createRemoteCalculation, type RemoteCalculation } from './client';
import { authClient, authentication } from '../auth/runtime';
import { getStorage } from '../storage/database';
import { usageAccess } from '../usage/runtime';
import { meteredGeneration } from '../usage/generation';
import { AllowanceError } from '../usage/model';

const base = computeBaseUrl(process.env.EXPO_PUBLIC_COMPUTE_BASE_URL);
export const calculateServerRoute: RemoteCalculation = async (input,signal,refresh) => {
  const owner = authentication.getSnapshot().account?.id;
  if (!base || !owner || !authClient) throw new AllowanceError('온라인 로그인 후 코스를 생성해 주세요.');
  const store = await getStorage();
  const check = () => { if (authentication.getSnapshot().account?.id !== owner) throw new AllowanceError('계정이 바뀌었어요.'); };
  const journal = {
    async read() { check(); const result=await store.usageJobs.read();check();return result; },
    async write(id:string,request:string,result:string|null) { check();await store.usageJobs.write(id,request,result);check(); },
    async clear(id:string) {check();await store.usageJobs.clear(id);check();},
  };
  return meteredGeneration(id=>createRemoteCalculation(base,fetch,75000,async()=>{
    check();const {data,error}=await authClient!.auth.getSession();check();
    if(error || !data.session)throw new AllowanceError('다시 로그인해 주세요.');
    return {authorization:`Bearer ${data.session.access_token}`,'x-operation-id':id};
  }),usageAccess,journal)(input,signal,refresh);
};
