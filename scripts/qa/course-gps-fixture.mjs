// Public regression OSM coordinates only. Short prefix and repeated closed route
// are QA fixtures, never user-generated recommendations or server uploads.
import fs from 'node:fs';
import { courseFromCalculation } from '../../src/features/route-lab/saved-course.ts';
import { encodeSnapshot } from '../../src/modules/courses/model.ts';
import { prepareRoute, positionAt, distance } from '../../src/modules/guidance/geometry.ts';
const f = JSON.parse(fs.readFileSync('tests/fixtures/route-engine/seoul-heart-v02.json', 'utf8'));
const input = JSON.parse(fs.readFileSync('assets/route-lab/seoul.json', 'utf8'));
const original = courseFromCalculation({ origin: input.origin, options: f.options, result: f.result, liveRoads: true }, 0);
const prepared = prepareRoute(original.route);
const short = [prepared.points[0]];
for (let m = 3; m < 240; m += 3) short.push(positionAt(prepared, m));
short.push(positionAt(prepared, 240));
if (distance(original.route[0], original.route.at(-1)) > 0.1) throw new Error('Long fixture requires a closed OSM route');
const long = [...original.route];
while (prepareRoute(long).totalMeters < 10000) long.push(...original.route.slice(1));
const make = (points, label, id) => ({ label, id, ...encodeSnapshot({ ...original, route: points, lengthKm: prepareRoute(points).totalMeters / 1000 }) });
fs.mkdirSync('.cache/course-gps-qa', { recursive: true });
fs.writeFileSync('.cache/course-gps-qa/fixtures.json', JSON.stringify([
  make(short, 'GPS QA 짧은 OSM 경로', 'd'.repeat(32)), make(long, 'GPS QA 잠금 30분 OSM 경로', 'e'.repeat(32)),
]));
console.log(JSON.stringify({ source: 'seoul-heart-v02.json / candidate 0', shortM: prepareRoute(short).totalMeters, longM: prepareRoute(long).totalMeters }));
