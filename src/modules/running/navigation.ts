import { createApproachPlanner } from './approach';
import { loadMobileRoads } from '../road-data/mobile-loader';
import { mobileScheduler } from '../../features/route-lab/scheduler';
import { authentication } from '../auth/runtime';
import { onRoadVersionChange } from '../road-data/events';
export const planApproach = createApproachPlanner(loadMobileRoads, mobileScheduler.yieldToHost);

let owner=authentication.getSnapshot().account?.id;
authentication.subscribe(()=>{const next=authentication.getSnapshot().account?.id;if(next!==owner){owner=next;planApproach.clear();}});
onRoadVersionChange(()=>planApproach.roadsChanged());
