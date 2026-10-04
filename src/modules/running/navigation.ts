import { createApproachPlanner } from './approach';
import { loadMobileRoads } from '../road-data/mobile-loader';
import { mobileScheduler } from '../../features/route-lab/scheduler';
export const planApproach = createApproachPlanner(loadMobileRoads, mobileScheduler.yieldToHost);
