import {useMemo,useState} from 'react';
import {View} from 'react-native';
import {router} from 'expo-router';
import {AppText,Button} from '@/components/ui';
import LiveGuidancePanel from '@/features/running/LiveGuidancePanel';
import {createGuidance} from '@/modules/guidance/engine';
import type {GuidanceOptions,RunGuidance} from '@/modules/running/guidance';
import type {Run,RunPoint} from '@/modules/running/model';

/** Layout-only fixture. Never starts tracking or reads/writes any account data. */
export default function RunningPreview(){
  const [options,setOptions]=useState<GuidanceOptions>({mode:'focus',voice:false,background:false}),[off,setOff]=useState(false),[paused,setPaused]=useState(false);
  const route=useMemo<[number,number][]>(()=>[[127,37],[127,37.001],[126.999,37.001],[126.999,37],[127,37]],[]);
  const engine=useMemo(()=>{const e=createGuidance(route);e.ingest({position:[127,37],timestamp:0,accuracy:5});e.ingest({position:[127,37.0001],timestamp:1000,accuracy:5});return e;},[route]);
  const checkpoint=engine.checkpoint();if(off){checkpoint.off=true;checkpoint.weak=false;checkpoint.separation=80;}
  const guide:RunGuidance={course:{id:'f'.repeat(32),name:'UI 미리보기 · 예시 코스',snapshot:{schemaVersion:1,engineVersion:'0.2',source:'osm',shape:'heart',origin:{lat:37,lng:127},targetKm:3,lengthKm:3,score:90,route,target:route}},checkpoint,options,state:engine.snapshot()};
  const run:Run={id:'f'.repeat(32),status:paused?'paused':'running',startedAt:0,endedAt:null,activeMs:300000,checkpointAt:1000,distanceM:1200,pointCount:2,rejectedCount:0,lastTimestamp:1000,segment:0,breakPending:0,resumedAt:0,reason:null};
  const points:RunPoint[]=[{sequence:0,segment:0,timestamp:0,latitude:37,longitude:127,accuracy:5},{sequence:1,segment:0,timestamp:1000,latitude:37.0001,longitude:127,accuracy:5}];
  return <View style={{flex:1}}><View style={{padding:8,backgroundColor:'#FFFFFF',flexDirection:'row',alignItems:'center',gap:8}}><AppText variant="caption" style={{flex:1}}>UI 미리보기 · 예시 수치 · 기록하지 않음</AppText><Button compact label={off?'정상':'이탈'} onPress={()=>setOff(!off)}/><Button compact variant="outline" label="닫기" onPress={()=>router.back()}/></View><LiveGuidancePanel run={run} guide={guide} points={points} now={1000} busy={false} error="" onOptions={setOptions} onPauseResume={()=>setPaused(!paused)} onFinish={()=>router.back()} onSettings={()=>setOptions({...options,touchLock:!options.touchLock})}/></View>;
}
