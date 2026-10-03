import { createClient } from '@supabase/supabase-js';
import { fetch as expoFetch } from 'expo/fetch';
import { authentication, authClient } from '../auth/runtime';
import { authConfig } from '../auth/config';
import { getStorage } from '../storage/database';
import { createSyncRemote } from './remote';
import { resolveConflict, synchronize } from './engine';
import { SyncError, syncErrorMessage } from './model';
import type { SyncConflict, SyncRepository } from './repository';

type Status = Awaited<ReturnType<SyncRepository['status']>>;
export type SyncState = { owner:string|null; busy:boolean; status:Status|null; message:string };
let state:SyncState={ owner:null,busy:false,status:null,message:'' };
const listeners=new Set<()=>void>();
let abort:AbortController|null=null, operation:Promise<void>|null=null, epoch=0, active=false, started=false, observed=false;
let nextAttempt=0, failures=0;
const update=(patch:Partial<SyncState>)=>{ state={...state,...patch}; listeners.forEach(listener=>listener()); };
async function refresh() {
  const owner=authentication.getSnapshot().account?.id;
  if (!owner) return;
  const current=epoch;
  try {
    const status=await (await getStorage()).sync.status(owner);
    if (epoch===current) update({status});
  } catch(error) { if (epoch===current) update({message:syncErrorMessage(error)}); }
}
async function remoteFor(owner:string,signal:AbortSignal) {
  const config=authConfig(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const session=await authClient?.auth.getSession();
  if (!config || session?.error || session?.data.session?.user.id!==owner) throw new SyncError('로그인 상태를 확인한 뒤 다시 시도해 주세요.');
  // Freeze this account's credential for the operation. A later login cannot retarget requests.
  const token=session.data.session.access_token;
  const client=createClient(config.url,config.key,{
    accessToken:async()=>token,
    global:{ fetch:async(input,init)=>{
      if (signal.aborted) throw new SyncError('동기화를 중단했어요.');
      const request=new AbortController();
      const cancel=()=>request.abort();
      signal.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(cancel,30000);
      try { return await expoFetch(input as string,{...init,signal:request.signal}) as unknown as Response; }
      finally { clearTimeout(timer); signal.removeEventListener('abort',cancel); }
    } },
  });
  return createSyncRemote(client,owner);
}
function execute(action?:{claim:boolean}|{conflict:SyncConflict;choice:'local'|'remote'}) {
  if (operation) return operation;
  const owner=authentication.getSnapshot().account?.id,current=epoch;
  if (!owner) return Promise.resolve();
  const cancellation=new AbortController(); abort=cancellation;
  const check=()=>{
    if (epoch!==current || cancellation.signal.aborted || authentication.getSnapshot().account?.id!==owner) throw new SyncError('계정 변경 또는 앱 중단으로 동기화를 멈췄어요.');
  };
  update({busy:true,message:''});
  operation=(async()=>{
    const repository=(await getStorage()).sync; check();
    if (action && 'claim' in action) await repository.enable(owner,action.claim);
    const remote=await remoteFor(owner,cancellation.signal); check();
    if (action && 'conflict' in action) await resolveConflict({owner,repository,remote,conflict:action.conflict,choice:action.choice,check});
    const result=await synchronize({owner,repository,remote,check}); check();
    failures=0; nextAttempt=Date.now()+30000;
    update({message:result.conflicts ? `동기화 충돌 ${result.conflicts}건이 있어요. 유지할 내용을 선택해 주세요.` : `동기화 완료 · 전송 ${result.uploaded}건 · 복원 ${result.restored}건`});
  })().catch(error=>{
    failures++; nextAttempt=Date.now()+Math.min(300000,30000*2**Math.min(failures-1,4));
    if (epoch===current) update({message:syncErrorMessage(error)});
  }).finally(async()=>{
    operation=null; abort=null;
    update({busy:false});
    await refresh();
  });
  return operation;
}
async function automatically() {
  if (!active || operation || !state.owner || Date.now()<nextAttempt) return;
  await refresh();
  if (active && state.status?.enabled) await execute();
}
export const personalSync={
  getSnapshot:()=>state,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  start:()=>{
    if (started) return; started=true;
    const observe=()=>{
      const auth=authentication.getSnapshot();
      if (!auth.ready) return;
      const owner=auth.account?.id??null;
      if (observed && owner===state.owner) return;
      observed=true;
      epoch++; abort?.abort(); failures=0;nextAttempt=0;
      update({owner,status:null,message:''});
      void getStorage().then(store=>store.sync.interruptOtherRuns(owner??'')).catch(()=>{update({message:'다른 계정의 진행 중 기록을 정리하지 못했어요. 앱을 다시 열어 주세요.'});});
      void automatically();
    };
    authentication.subscribe(observe); observe();
    setInterval(()=>{void automatically();},30000);
  },
  setActive:(value:boolean)=>{
    active=value;
    if (!value) abort?.abort();
    else {nextAttempt=0;void automatically();}
  },
  refresh,
  sync:()=>execute(),
  enable:(claim:boolean)=>execute({claim}),
  resolve:(conflict:SyncConflict,choice:'local'|'remote')=>execute({conflict,choice}),
  disable:async()=>{
    abort?.abort();
    if (operation) await operation;
    const owner=authentication.getSnapshot().account?.id;
    if (!owner) return;
    try {await (await getStorage()).sync.disable(owner);update({message:'자동 동기화를 껐어요. 기기와 서버 기록은 유지됩니다.'});await refresh();}
    catch(error){update({message:syncErrorMessage(error)});}
  },
};
