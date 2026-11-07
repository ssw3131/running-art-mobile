import { navigationBearing } from '../../src/features/running/navigation-bearing';
import { offset } from '../../src/modules/guidance/geometry';
import { createLoopGuidance } from '../../src/modules/guidance/loop-engine';
const route=[[0,0],[0,240],[240,240],[240,0],[0,0]].map(([x,y])=>offset([127,37],x,y));
test('map rotation follows the next course leg in either running direction',()=>{
 const engine=createLoopGuidance(route),state=engine.snapshot(),checkpoint=engine.checkpoint();
 const forward={...checkpoint,origin:0,direction:1 as const,cursor:0};
 expect(navigationBearing(route,state,forward)).toBeCloseTo(0,1);
 expect(navigationBearing(route,state,{...forward,cursor:260})).toBeCloseTo(90,1);
 expect(navigationBearing(route,state,{...forward,direction:-1})).toBeCloseTo(90,1);
});
test('a return route rotates upward independently of the original course tangent',()=>{
 const engine=createLoopGuidance(route),checkpoint=engine.checkpoint();
 const state={...engine.snapshot(),returnPath:[route[2],route[3]]};
 expect(navigationBearing(route,state,checkpoint)).toBeCloseTo(180,1);
});
