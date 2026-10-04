import type { Point } from '../../modules/route-engine/types.ts';
import { validateCustomTemplate } from '../../modules/route-engine/engine.ts';

export const DRAWING_POINTS_MAX = 2048;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function lineDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// Iterative RDP preserves corners without an unbounded recursion on touch input.
function simplify(points: Point[], tolerance: number) {
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let furthest = -1, maximum = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = lineDistance(points[i], points[first], points[last]);
      if (d > maximum) { maximum = d; furthest = i; }
    }
    if (furthest >= 0) { keep.add(furthest); stack.push([first, furthest], [furthest, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => ({ ...points[i] }));
}

function intersects(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const on = (p: Point, q: Point, r: Point) => Math.abs(cross(p, q, r)) < 1e-9 &&
    r.x >= Math.min(p.x, q.x) - 1e-9 && r.x <= Math.max(p.x, q.x) + 1e-9 &&
    r.y >= Math.min(p.y, q.y) - 1e-9 && r.y <= Math.max(p.y, q.y) + 1e-9;
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

/** Canvas input uses a square, normalized 0..1 with y down. Engine uses y up. */
export function drawingTemplate(stroke: Point[]): Point[] {
  if (!Array.isArray(stroke) || stroke.length < 4) throw new Error('한 획으로 도형을 그린 뒤 시작점으로 돌아와 주세요.');
  if (stroke.length > DRAWING_POINTS_MAX) throw new Error('선이 너무 길어요. 조금 더 단순하게 그려 주세요.');
  if (stroke.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) {
    throw new Error('그리기 영역 안에서 다시 그려 주세요.');
  }
  const points = stroke.filter((p, i) => i === 0 || distance(p, stroke[i - 1]) > 0.0001);
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  if (Math.min(maxX - minX, maxY - minY) < 0.08 || span < 0.2) throw new Error('도형을 조금 더 크게 그려 주세요. 선 하나는 코스로 만들 수 없어요.');
  if (distance(points[0], points.at(-1)!) > span * 0.18) throw new Error('시작점으로 돌아와 도형을 닫아 주세요. 작은 틈은 자동으로 이어져요.');
  const normalized = points.map(p => ({ x: (p.x - (minX + maxX) / 2) * 2 / span, y: ((minY + maxY) / 2 - p.y) * 2 / span }));
  // Snap a nearly closed final point, otherwise preview the short closing segment.
  if (distance(normalized[0], normalized.at(-1)!) < 0.025) normalized[normalized.length - 1] = { ...normalized[0] };
  else normalized.push({ ...normalized[0] });
  let result = simplify(normalized, 0.012);
  for (let tolerance = 0.018; result.length > 49 && tolerance <= 0.07; tolerance *= 1.5) result = simplify(normalized, tolerance);
  if (result.length < 4 || result.length > 49) throw new Error('모양이 너무 복잡해요. 굴곡을 줄여 다시 그려 주세요.');
  for (let i = 0; i < result.length - 1; i++) for (let j = i + 2; j < result.length - 1; j++) {
    if (i === 0 && j === result.length - 2) continue;
    if (intersects(result[i], result[i + 1], result[j], result[j + 1])) throw new Error('선이 서로 겹치거나 교차하지 않도록 그려 주세요.');
  }
  const area = Math.abs(result.slice(1).reduce((sum, p, i) => sum + result[i].x * p.y - p.x * result[i].y, 0)) / 2;
  if (area < 0.06) throw new Error('도형 안쪽에 넓이가 생기도록 그려 주세요.');
  return validateCustomTemplate(result);
}

export function templatePreview(points: Point[]) {
  return points.map(p => ({ x: 0.5 + p.x * 0.42, y: 0.5 - p.y * 0.42 }));
}
