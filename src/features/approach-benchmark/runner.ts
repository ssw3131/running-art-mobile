import {createApproachPlanner} from '../../modules/running/approach.ts';
import type {ApproachRequest,ApproachPlan} from '../../modules/running/approach.ts';
import type {ApproachTiming} from '../../modules/running/approach-cache.ts';
import {createApproachPlanner as previous} from './baseline.ts';
import {createRoadLoader} from '../../modules/road-data/client.ts';
import type {RoadAttempt,RoadLoader} from '../../modules/road-data/client.ts';
import type {RoadCache} from '../../modules/road-data/persistent-cache.ts';
import type {RoadFetch} from '../../modules/road-data/channel.ts';
import input from './input.ts';

export type Sample={iteration:number;version:'baseline'|'current';condition:'cold'|'file'|'graph'|'plan';ok:boolean;elapsedMs:number;roadMs:number;timing?:ApproachTiming;distanceM?:number;targetM?:number;attempts:RoadAttempt[];error?:string};
export async function runApproachBenchmark(options:{
 openCache:()=>Promise<RoadCache>;fetcher:RoadFetch;yieldToHost:()=>Promise<void>;
 signal:AbortSignal;emit:(sample:Sample)=>void;count?:number;
}){
 const {signal,emit,yieldToHost}=options,rows:Sample[]=[];
 const first=input.first as unknown as ApproachRequest,moved=input.moved as unknown as ApproachRequest;
 for(let iteration=0;iteration<(options.count??20);iteration++){
  for(const version of (iteration%2?['current','baseline']:['baseline','current']) as Sample['version'][]){
   if(signal.aborted)throw Error('Benchmark cancelled');
   let cache=await options.openCache();
   try{
    await cache.clear();
    let attempts:RoadAttempt[]=[],roadMs=0;
    const loader=createRoadLoader({getCache:async()=>cache,fetcher:options.fetcher,supply:'national',yieldToHost,onAttempt:a=>attempts.push(a)});
    const load:RoadLoader=async(...args)=>{
     const at=performance.now();try{
      const result=await loader(...args);
      if(result.cache?.manifestHash!==input.expected.manifestHash)throw Error('Pinned road manifest changed');
      return result;
     }finally{roadMs+=performance.now()-at;}
    };
    const make=()=>version==='current'?createApproachPlanner(load,yieldToHost):previous(load,yieldToHost);
    let planner=make();
    for(const condition of ['cold','file','graph','plan'] as const){
     if(signal.aborted)throw Error('Benchmark cancelled');
     if(condition==='file'){await cache.close();cache=await options.openCache();planner=make();}
     attempts=[];roadMs=0;
     const request=condition==='graph'||condition==='plan'?moved:first;
     const controller=new AbortController(),abort=()=>controller.abort();
     signal.addEventListener('abort',abort,{once:true});
     let timeout=false,timing:ApproachTiming|undefined,plan:ApproachPlan|undefined,error:string|undefined;
     const timer=setTimeout(()=>{timeout=true;controller.abort();},10000),at=performance.now();
     try{
      plan=await planner(request,controller.signal,(t:ApproachTiming)=>{timing=t;});
      if(timeout)throw Error('10s deadline exceeded');
      if(condition==='cold'&&(!attempts.length||!attempts.some(a=>(a.cache?.downloaded??0)>0)))throw Error('Cold sample did not download roads');
      if(condition==='file'&&(!attempts.length||attempts.some(a=>a.requests!==0||a.cache?.downloaded!==0)))throw Error('File sample used network');
      if(version==='current'&&(condition==='graph'||condition==='plan')&&(timing?.cache!==condition||roadMs!==0||attempts.length))throw Error(`Expected isolated ${condition} cache`);
      if((condition==='cold'||condition==='file')&&Math.abs(plan.distanceM-input.expected.distanceM)>1)throw Error('Walking distance differs from pinned reference');
     }catch(e){error=e instanceof Error?e.message:String(e);}
     finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
     const row:Sample={iteration,version,condition,ok:!error,elapsedMs:performance.now()-at,roadMs,timing,distanceM:plan?.distanceM,targetM:plan?.targetM,attempts,...(error?{error}:{} )};
     rows.push(row);emit(row);await yieldToHost();
     // A failed prerequisite makes dependent cache samples invalid; keep explicit rows.
     if(error){planner=make();}
    }
   }finally{await cache.clear();await cache.close();}
  }
 }
 return {schemaVersion:1,baseline:input.baseline,manifest:input.expected.manifestHash,release:input.expected.release,rows};
}
