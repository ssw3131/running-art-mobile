import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunningSimulation } from '../src/modules/running/simulation.ts';
import { offset } from '../src/modules/guidance/geometry.ts';
import { buildSimulationRecord } from '../src/modules/running/simulation-record.ts';
const route=[[0,0],[0,240],[240,240],[240,0],[0,0]].map(([x,y])=>offset([127,37],x,y));

test('nearby origins on the same directed course do not leave simulation waiting for direction forever',()=>{
 const overlapping=[[0,0],[0,3],[0,0],[0,240],[240,240],[240,0],[0,0]].map(([x,y])=>offset([127,37],x,y));
 const s=createRunningSimulation(overlapping);s.play(0);let state,arrow=false;
 for(let clock=100;clock<=20000;clock+=100){state=s.update(clock);arrow ||= ['left','right'].includes(state.direction);if(state.status==='arrived')break;}
 assert.ok(arrow,'moving virtual fixes must resolve the overlapping origin candidates and show a turn');
 assert.equal(state.status,'arrived');
 const course={id:'11111111-1111-4111-8111-111111111111',name:'overlapping',snapshot:{route:overlapping}};
 const recording=s.recording();
 const saved=buildSimulationRecord('22222222222222222222222222222222',course,recording.fixes,recording.elapsedMs,1800000000000);
 assert.equal(saved.run.courseOutcome,'finished','record replay must agree with the on-screen simulation');
});
test('accelerated simulation uses one-second fixes, confirms direction, emits turns and completes the actual loop engine',()=>{
 const s=createRunningSimulation(route);s.play(0);let v,clock=0;const phases=new Set(),directions=new Set();
 for(let i=0;i<250;i++){clock+=100;v=s.update(clock);phases.add(v.phase);directions.add(v.direction);if(v.status==='arrived')break;}
 assert.equal(v.status,'arrived');assert.equal(v.playing,false);assert.ok(phases.has('direction'));assert.ok(phases.has('lap'));assert.ok(directions.has('right')||directions.has('left'));assert.ok(v.events.some(e=>e.kind==='turn'));assert.equal(s.checkpoint().version,2);
});
test('pause does not advance virtual time, accelerated departure triggers off-route and retracing confirms recovery',()=>{
 const s=createRunningSimulation(route);s.play(0);s.update(2000);s.pause(2000);const elapsed=s.snapshot().elapsedMs;s.update(60000);assert.equal(s.snapshot().elapsedMs,elapsed);
 s.command('depart');s.play(60000);let v=s.update(61000);assert.equal(v.status,'off-route');assert.equal(v.phase,'return');
 s.command('return');for(let t=61100;t<65000;t+=100){v=s.update(t);if(v.events.some(e=>e.kind==='returned'))break;}
 assert.ok(v.events.some(e=>e.kind==='returned'));assert.equal(v.status,'normal');assert.equal(v.phase,'lap');
});
test('speed changes retain sampled progress and signal loss stays a real weak-signal state',()=>{
 const s=createRunningSimulation(route);s.play(0);s.update(1000);s.speed(5,1000);const before=s.snapshot().elapsedMs;s.update(2000);assert.equal(s.snapshot().elapsedMs-before,5000);
 s.command('lost');s.update(4000);assert.equal(s.snapshot().status,'weak');assert.throws(()=>s.speed(0,4000));
});
