import type { BadgeDefinition, BadgeProgress } from './catalog.ts';

type ChallengeDefinition = {
  id: string;
  title: string;
  description: string;
  image: string;
  kinds: BadgeDefinition['kind'][];
};
const definitions: ChallengeDefinition[] = [
  { id:'distance', title:'누적 거리 달성', description:'전체 러닝 누적거리를 늘려보세요.', image:'distance-50', kinds:['distance'] },
  { id:'time', title:'누적 시간 달성', description:'전체 러닝 시간을 늘려보세요.', image:'time-50', kinds:['time'] },
  { id:'category', title:'카테고리별 작품 완주', description:'코스 카테고리별로 완주해보세요.', image:'animals', kinds:['category'] },
  { id:'collection', title:'다양한 작품 완주', description:'다양한 러닝아트 작품을 수집해보세요.', image:'collection-3', kinds:['collection'] },
  { id:'variation', title:'동일 코스 변주 완주', description:'동일 코스를 거리, 장소를 다르게 완주', image:'distance-variation', kinds:['distance-variation','region-variation'] },
  { id:'repeat', title:'동일 코스 반복 완주', description:'동일 코스를 여러번 반복 완주하세요.', image:'repeat-5', kinds:['repeat'] },
];

export function challengeGroups(badges: readonly BadgeProgress[]) {
  return definitions.map(definition => {
    const goals = badges.filter(b => definition.kinds.includes(b.definition.kind));
    const earned = goals.filter(b => b.earned).length;
    const started = goals.some(b => b.progress > 0);
    return { ...definition, goals, earned, started, active: started && earned < goals.length };
  });
}
export type ChallengeGroup = ReturnType<typeof challengeGroups>[number];
