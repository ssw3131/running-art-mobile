import type { LabCalculation } from './session.ts';
import { candidateOverlay } from '../../modules/route-engine/geojson.ts';
import { CourseError, validateSnapshot } from '../../modules/courses/model.ts';

export function courseFromCalculation(completed: LabCalculation, index: number) {
  const candidate = Number.isSafeInteger(index) && index >= 0 ? completed.result.candidates[index] : undefined;
  if (!candidate) throw new CourseError('validation', '저장할 코스를 먼저 선택해 주세요.');
  const overlay = candidateOverlay(candidate, completed.origin);
  const customTemplate = completed.options.customTemplate;
  return validateSnapshot({ schemaVersion: customTemplate ? 3 : completed.result.mode === 'free-loop' ? 2 : 1,
    ...(customTemplate ? { customTemplate } : {}), roadSegments: candidate.roadSegments, engineVersion: completed.result.version,
    source: completed.liveRoads ? 'osm' : 'synthetic', shape: customTemplate ? 'custom' : completed.options.shape,
    origin: completed.origin, targetKm: completed.options.targetKm, lengthKm: candidate.score.lengthKm, score: candidate.score.total,
    route: overlay.route.geometry.coordinates, target: overlay.target.geometry.coordinates });
}
