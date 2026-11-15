import {useEffect,useRef,useState} from 'react';
import {Button,ScrollView,Text} from 'react-native';
import {fetch} from 'expo/fetch';
import * as SQLite from 'expo-sqlite';
import {createRoadCache,migrateRoadCache} from '@/modules/road-data/persistent-cache';
import {mobileRoadCodecs} from '@/modules/road-data/mobile-codecs';
import {mobileScheduler} from '@/features/route-lab/scheduler';
import {runApproachBenchmark} from '@/features/approach-benchmark/runner';

// Deliberate diagnostic route, never started from a URL parameter or product flow.
const DATABASE='running-art-approach-benchmark-v1.db';
export default function ApproachBenchmarkScreen(){
 const current=useRef<AbortController|null>(null),[status,setStatus]=useState('공개 강남 도로 · 이전/현재 각 조건 20회 · 생성 횟수 미사용');
 const [busy,setBusy]=useState(false);
 useEffect(()=>()=>{current.current?.abort();},[]);
 async function start(){
  if(current.current)return;
  const controller=new AbortController();current.current=controller;setBusy(true);
  console.info('APPROACH_BENCH_META',JSON.stringify({started:new Date().toISOString(),hermes:!!(globalThis as {HermesInternal?:unknown}).HermesInternal,dev:__DEV__,database:DATABASE}));
  try{
   const result=await runApproachBenchmark({signal:controller.signal,fetcher:fetch,yieldToHost:mobileScheduler.yieldToHost,
    openCache:async()=>{const db=await SQLite.openDatabaseAsync(DATABASE);try{await migrateRoadCache(db);return createRoadCache(db,mobileRoadCodecs);}catch(e){await db.closeAsync();throw e;}},
    emit:row=>{console.info('APPROACH_BENCH_SAMPLE',JSON.stringify(row));if(!controller.signal.aborted)setStatus(`${row.iteration+1}/20 ${row.version} ${row.condition}: ${row.elapsedMs.toFixed(1)} ms${row.error?' · '+row.error:''}`);},
   });
   const errors=result.rows.filter(r=>!r.ok).length;
   console.info('APPROACH_BENCH_DONE',JSON.stringify({count:result.rows.length,errors,baseline:result.baseline,manifest:result.manifest,release:result.release,finished:new Date().toISOString()}));
   setStatus(`완료 ${result.rows.length}개 · 실패 ${errors}개 · 원본은 기기 진단 로그`);
  }catch(e){const message=e instanceof Error?e.message:String(e);console.info('APPROACH_BENCH_ERROR',message);setStatus(message);}
  finally{await SQLite.deleteDatabaseAsync(DATABASE).catch(()=>{});current.current=null;setBusy(false);}
 }
 return <ScrollView contentContainerStyle={{padding:24,gap:24}}><Text accessibilityRole="header">합류 경로 반복 측정</Text><Text testID="benchmark-status">{status}</Text><Button title="20회 측정 시작" testID="benchmark-start" disabled={busy} onPress={()=>{void start();}}/><Button title="측정 중지" disabled={!busy} onPress={()=>current.current?.abort()}/></ScrollView>;
}
