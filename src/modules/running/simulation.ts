import { createLoopGuidance, courseProjection, loopAt, type LoopCheckpoint } from '../guidance/loop-engine.ts';
import { createSimulator, type SimulationCommand } from '../guidance/simulator.ts';
import type { GuidanceFix } from '../guidance/engine.ts';
import { prepareRoute, type Coordinate } from '../guidance/geometry.ts';
import type { ApproachPlan } from './approach.ts';

/** Foreground-only virtual fixes; the production loop engine never knows their source.
 * This module has no GPS, persistence, quota, achievement or background-service access. */
export type SimulationContinuation={recordId:string;trace:Coordinate[][];checkpoint:LoopCheckpoint;fixes:GuidanceFix[];elapsedMs:number};
export function createRunningSimulation(route:readonly Coordinate[],previous?:SimulationContinuation){
  const checkpoint=previous?.checkpoint;
  const directed=checkpoint?.origin!==null&&checkpoint?.origin!==undefined&&checkpoint.direction?loopAt(prepareRoute(route),checkpoint.origin,checkpoint.direction):null;
  const sourceRoute=directed?.points??route;
  const cursor=previous?(directed?previous.checkpoint.cursor:courseProjection(route,previous.checkpoint.current).meters):0;
  const engine=createLoopGuidance(route,checkpoint),source=createSimulator(sourceRoute,'normal',previous?{cursor,elapsed:previous.elapsedMs}:undefined);
  const fixes:GuidanceFix[]=previous?previous.fixes.map(f=>({...f,position:[...f.position] as Coordinate})):[];
  const previousTrace=previous?.trace.map(path=>path.map(point=>[...point] as Coordinate))??[];
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
