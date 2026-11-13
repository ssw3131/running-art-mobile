import { createLoopGuidance, courseProjection, type LoopCheckpoint } from '../guidance/loop-engine.ts';
import { createSimulator, type SimulationCommand } from '../guidance/simulator.ts';
import type { GuidanceFix } from '../guidance/engine.ts';
import { prepareRoute, type Coordinate } from '../guidance/geometry.ts';
import type { ApproachPlan } from './approach.ts';

/** Foreground-only virtual fixes; the production loop engine never knows their source.
 * This module has no GPS, persistence, quota, achievement or background-service access. */
export type SimulationContinuation={recordId:string;checkpoint:LoopCheckpoint;fixes:GuidanceFix[];elapsedMs:number};
export function createRunningSimulation(route:readonly Coordinate[],previous?:SimulationContinuation){
  const total=prepareRoute(route).totalMeters;
  const cursor=previous?.checkpoint.origin!==null&&previous?.checkpoint.origin!==undefined?((previous.checkpoint.origin+(previous.checkpoint.direction??1)*previous.checkpoint.cursor)%total+total)%total:previous?courseProjection(route,previous.checkpoint.current).meters:0;
  const engine=createLoopGuidance(route,previous?.checkpoint),source=createSimulator(route,'normal',previous?{cursor,elapsed:previous.elapsedMs}:undefined);
  const fixes:GuidanceFix[]=previous?previous.fixes.map(f=>({...f,position:[...f.position] as Coordinate})):[];
  const previousTrace:Coordinate[][]=[];
  for(const [i,fix] of fixes.entries()){if(!i||fix.timestamp-fixes[i-1].timestamp>5000)previousTrace.push([]);previousTrace.at(-1)!.push([...fix.position]);}
  if(previous)engine.resume();
  let playing=false,speed=30,lastClock=0,remainder=0;
  const first=previous?null:source.sample();if(first){engine.ingest(first);fixes.push(first);}
  const snapshot=()=>{const value=engine.snapshot();return {...value,trace:previous?[...previousTrace,...value.trace]:value.trace,playing,speed};};
  function update(clock:number){
    if(!Number.isFinite(clock))throw new Error('시뮬레이션 시계를 확인할 수 없어요.');
    if(playing){remainder+=Math.max(0,clock-lastClock)*speed;let steps=0;
      while(remainder>=1000&&playing&&steps++<300){const fix=source.step();if(fix){engine.ingest(fix);fixes.push(fix);}else engine.tick(source.elapsed());remainder-=1000;if(engine.snapshot().status==='arrived')playing=false;}
    }
    lastClock=clock;return snapshot();
  }
  return {snapshot,update,recording:()=>({...(previous?{continuedFrom:previous.recordId}:{}),fixes:fixes.map(f=>({...f,position:[...f.position] as Coordinate})),elapsedMs:source.elapsed()}),checkpoint:()=>engine.checkpoint(),
    play(clock:number){lastClock=clock;if(engine.snapshot().status!=='arrived')playing=true;return snapshot();},
    pause(clock:number){update(clock);playing=false;return snapshot();},
    speed(value:number,clock:number){if(![5,10,30].includes(value))throw new Error('지원하지 않는 배속이에요.');update(clock);speed=value;return snapshot();},
    command(value:SimulationCommand){source.command(value);},
    navigationRequest:()=>engine.navigationRequest(),
    setNavigation(plan:ApproachPlan|null,error:string|null=null){engine.setNavigation(plan,error);return snapshot();},
  };
}
