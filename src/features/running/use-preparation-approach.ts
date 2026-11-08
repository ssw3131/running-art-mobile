import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { planApproach } from '@/modules/running/navigation';
import { validApproach, type ApproachPlan } from '@/modules/running/approach';
import { courseProjection } from '@/modules/guidance/loop-engine';
import { distance, type Coordinate } from '@/modules/guidance/geometry';
import type { RunCourse } from '@/modules/running/guidance';
import type { Fix } from '@/modules/running/model';

export function usePreparationApproach(course:RunCourse|null,fix:Fix|null,enabled=true){
  const [plan,setPlan]=useState<ApproachPlan|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const generation=useRef(0),latest=useRef<Coordinate|null>(null),failureAt=useRef(0),pending=useRef<{cancel:AbortController;origin:Coordinate}|null>(null),active=useRef(false);
  const courseId=course?.id;
  const latestPlan=useRef<ApproachPlan|null>(null);
  const readPlan=useCallback(()=>latestPlan.current,[]);
  useFocusEffect(useCallback(()=>{if(!courseId)return;active.current=true;generation.current++;failureAt.current=0;latestPlan.current=null;setPlan(null);setError('');return()=>{active.current=false;generation.current++;pending.current?.cancel.abort();pending.current=null;latestPlan.current=null;};},[courseId]));
  useEffect(()=>{
    if(!enabled){pending.current?.cancel.abort();pending.current=null;return;}
    if(!active.current||!course||!fix||fix.accuracy===null||fix.accuracy>30||Date.now()-fix.timestamp>5000)return;
    const position:Coordinate=[fix.longitude,fix.latitude];latest.current=position;
    if(courseProjection(course.snapshot.route,position).separation<=12){pending.current?.cancel.abort();pending.current=null;return;}
    if(plan){try{validApproach(plan,course.snapshot,position);return;}catch{}}
    if(pending.current&&distance(pending.current.origin,position)<20)return;
    pending.current?.cancel.abort();pending.current=null;
    if(Date.now()-failureAt.current<30000)return;
    const request={cancel:new AbortController(),origin:position},ticket=generation.current;pending.current=request;
    const timeout=setTimeout(()=>request.cancel.abort(),30000);
    void planApproach({course:course.snapshot,position,accuracy:fix.accuracy},request.cancel.signal).then(value=>{
      if(!active.current||ticket!==generation.current||pending.current!==request)return;
      validApproach(value,course.snapshot,latest.current??position);latestPlan.current=value;setPlan(value);setError('');
    }).catch(()=>{if(active.current&&ticket===generation.current&&pending.current===request){failureAt.current=Date.now();setError('도보 합류 경로를 확인하지 못했어요. 눌러서 다시 확인');}}).finally(()=>{clearTimeout(timeout);if(pending.current===request)pending.current=null;});
  },[course,fix,plan,retry,enabled]);
  let visiblePlan:ApproachPlan|null=null;
  if(plan&&course&&fix){try{validApproach(plan,course.snapshot,[fix.longitude,fix.latitude]);visiblePlan=plan;}catch{}}
  return {plan:visiblePlan,readPlan,error,retry:()=>{failureAt.current=0;setRetry(n=>n+1);}};
}
