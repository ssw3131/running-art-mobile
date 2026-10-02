import { roadSamples } from './channel';

// Switch only after the nationwide pointer has passed public verification.
export const ROAD_SUPPLY = 'national' as 'samples' | 'national';
export const roadLocations = ROAD_SUPPLY === 'national' ? [
  ...roadSamples,
  { id: 'daejeon', label: '대전 시청', origin: { lat: 36.3504, lng: 127.3845 } },
  { id: 'jeju', label: '제주 시청', origin: { lat: 33.4996, lng: 126.5312 } },
  { id: 'ulleung', label: '울릉도', origin: { lat: 37.4845, lng: 130.9057 } },
] : roadSamples;
export const roadCoverageDescription = ROAD_SUPPLY === 'national'
  ? '한국 OSM 도로 자료에서 지도 중심 주변 2km를 조회해요. 아래 위치를 선택하거나 지도를 움직여 원하는 곳에서 계산하세요.'
  : '현재는 서울 강남·부산 시청·구로/광명·판교로228번길 17 표본 주변 2km를 지원해요. 아래 위치를 선택하거나 표본 범위 안에서 지도를 움직여 계산하세요.';
