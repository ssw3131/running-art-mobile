import { fromByteArray } from 'base64-js';
import { strToU8 } from 'fflate';
import { homePathSvg, type HomePath } from '../home/model.ts';
import { courseShapes, type CourseSnapshot } from '../courses/model.ts';
import { durationLabel, paceLabel, type Run, type RunPoint } from '../running/model.ts';

export type CardOptions = { format: 'story' | 'feed'; nickname: boolean; date: boolean };
export const defaultCardOptions: CardOptions = { format: 'story', nickname: true, date: true };
export const cardSize = (format: CardOptions['format']) => ({ width: 1080, height: format === 'story' ? 1920 : 1350 });
export function cardContent(run: Run, course: CourseSnapshot | null, points: readonly RunPoint[], name: string, options: CardOptions) {
  if (run.status !== 'completed') throw new Error('Only completed runs can be shared');
  const paths: HomePath[] = [];
  if (course) paths.push(course.route);
  else {
    let segment = -1;
    for (const point of points) { if (point.segment !== segment) { paths.push([]); segment = point.segment; } paths.at(-1)!.push([point.longitude, point.latitude]); }
  }
  const d = new Date(run.startedAt);
  const stride = Math.max(1, Math.ceil(paths.reduce((sum, path) => sum + path.length, 0) / 2000));
  const previewPaths = paths.map(path => path.filter((_, index) => index === 0 || index === path.length - 1 || index % stride === 0));
  return {
    title: course ? `${courseShapes[course.shape]} 코스` : '오늘의 러닝',
    outcome: run.courseOutcome === 'finished' && course ? '완주를 축하합니다.' : '달린 길을 기록했어요.',
    nickname: options.nickname ? [...name.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()].slice(0, 20).join('') || '러너' : null,
    date: options.date ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` : null,
    pathLabel: course ? '계획 코스 윤곽' : '실제 러닝 윤곽',
    // Only normalized pixel coordinates enter the image. No address, map, raw GPS, or metadata.
    pathUri: homePathSvg(previewPaths, '#FC5602'),
    distance: `${(run.distanceM / 1000).toFixed(2)} km`, duration: durationLabel(run.activeMs), pace: paceLabel(run.activeMs, run.distanceM),
  };
}
export type CardContent = ReturnType<typeof cardContent>;
export function cardGradient(format: CardOptions['format']) {
  const height = cardSize(format).height / 3;
  return `data:image/svg+xml;base64,${fromByteArray(strToU8(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="0.55" y2="0.6"><stop stop-color="#FF992D"/><stop offset="1" stop-color="#FA417F"/></linearGradient></defs><rect width="360" height="${height}" fill="url(#g)"/></svg>`))}`;
}
