import type { FeatureCollection, LineString } from 'geojson';
import gridData from '@/assets/route-lab/grid.json';
import seoulData from '@/assets/route-lab/seoul.json';
import baselineData from '@/assets/route-lab/baselines.json';
import type { SearchInput, SearchOptions, SearchResult } from '@/modules/route-engine/types';

export type DatasetId = 'grid' | 'seoul' | 'disconnected';
const grid = gridData as SearchInput;
const seoul = seoulData as SearchInput;
const disconnected: SearchInput = {
  origin: grid.origin, options: { ...grid.options, targetKm: 3 },
  elements: [
    { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'footway' }, geometry: [{ lat: grid.origin.lat, lon: grid.origin.lng }, { lat: grid.origin.lat, lon: grid.origin.lng + .001 }] },
    { type: 'way', id: 2, nodes: [3, 4], tags: { highway: 'footway' }, geometry: [{ lat: grid.origin.lat + .003, lon: grid.origin.lng }, { lat: grid.origin.lat + .003, lon: grid.origin.lng + .001 }] },
  ],
};
export const datasets = {
  grid: { name: '합성 격자', description: '알고리즘 비교용 가상 도로예요. 실제 달릴 길이 아닙니다.', input: grid, synthetic: true },
  seoul: { name: '주변 OSM', description: '지도를 움직여 중심을 고르면 주변 2km 도로를 조회해 코스를 계산해요. 서울 밖에서도 사용할 수 있어요.', input: seoul, synthetic: false },
  disconnected: { name: '단절 테스트', description: '서로 연결되지 않은 짧은 가상 도로로 후보 없음 처리를 확인해요.', input: disconnected, synthetic: true },
} satisfies Record<DatasetId, { name: string; description: string; input: SearchInput; synthetic: boolean }>;

export function syntheticRoads(input: SearchInput): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: input.elements.filter((way) => way.geometry && way.geometry.length >= 2).map((way) => ({
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: way.geometry!.filter((p) => p !== null).map((p) => [p.lon, p.lat]) },
  })) };
}

const baselines = baselineData as { fixture: string; options: SearchOptions; result: SearchResult }[];
export function referenceFor(fixture: DatasetId, options: SearchOptions): SearchResult | null {
  return baselines.find((baseline) => baseline.fixture === fixture && baseline.options.shape === options.shape && baseline.options.targetKm === options.targetKm && baseline.options.radiusKm === options.radiusKm && baseline.options.version === options.version)?.result ?? null;
}
