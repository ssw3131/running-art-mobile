import { fetch } from 'expo/fetch';
import { createRoadLoader } from './client';
import { getRoadCache } from './cache-database';
import { mobileScheduler } from '../../features/route-lab/scheduler';
import { ROAD_SUPPLY } from './supply-config';

export const loadMobileRoads = createRoadLoader({
  supply: ROAD_SUPPLY,
  baseUrl: process.env.EXPO_PUBLIC_ROAD_BASE_URL,
  getCache: getRoadCache, fetcher: (url, init) => fetch(url, init), yieldToHost: mobileScheduler.yieldToHost,
  onAttempt: event => console.info('ROAD_DATA_ATTEMPT', JSON.stringify(event)),
});
