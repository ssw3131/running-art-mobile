import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Advisory routing, never a test-skip allowlist. Shared/unknown changes keep full CI.
export const areas = [
  { name: '홈·진입', match: /Home|home|open-service-tab|service\/navigation|\(tabs\)\/(index|_layout)/i,
    contract: 'docs/development/course-generation.md', tests: ['home', 'generation-home-entry', 'open-service-tab'], native: 'home', visual: ['home'] },
  { name: '코스 생성·위치·추천', match: /course-generation|course-(map|location|candidate)|route-lab|point-address/i,
    contract: 'docs/development/course-generation.md', tests: ['course-generation', 'course-location-picker', 'point-address', 'generation-home-entry'], native: 'generation', visual: [] },
  { name: '러닝·잠금·준비·보관함', match: /running|run-|runs\/|archive|courses\/|\(tabs\)\/(run|courses)/i,
    contract: 'docs/development/course-archive-running.md', tests: ['running-chooser', 'running-preparation', 'live-running', 'run-settings', 'archive'], native: 'service', visual: ['run', 'archive'] },
  { name: '배지·공유·마이페이지·지원', match: /achievement|badge|run-card|run-result|account|support|service-(faq|guide|notice|about|info)/i,
    contract: 'docs/development/verification-ci.md', tests: ['achievements', 'share-card-readiness', 'run-card-export', 'account-figma', 'support'], native: 'achievements', visual: ['account'] },
];
export function reviewPlan(changed) {
  const selected = areas.filter(area => changed.some(file => area.match.test(file)));
  return { changed, areas: selected.map(({ match: _match, ...area }) => area),
    tests: [...new Set(selected.flatMap(a => a.tests.map(name => `tests/components/${name}.test.tsx`)))],
    unclassified: changed.filter(file => !areas.some(a => a.match.test(file))),
    warning: '검토 경로 안내이며 테스트 통과나 CI 생략 증거가 아닙니다. 미분류·공통 변경은 전체 검사를 유지합니다.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] || 'main';
  // Resolve first, then pass only a full object ID to diff. Include uncommitted/new work.
  const resolved = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`], { encoding: 'utf8' }).trim();
  const changed = execFileSync('git', ['diff', '--name-only', '-z', resolved], { encoding: 'utf8' }).split('\0');
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0');
  const plan = reviewPlan([...new Set([...changed, ...untracked].filter(Boolean))]);
  console.log(JSON.stringify(plan, null, 2));
  if (plan.tests.length) console.log(`\n관련 UI 검사:\nnpm run test:components -- --cacheDirectory .cache/jest-local --runTestsByPath ${plan.tests.join(' ')}`);
  console.log('\nPC 피드백: npm run qa:local + 관련 Node 검사. 전체 빠른 검사: 지원 환경의 npm run qa:fast 또는 draft CI. 기획/기대 동작/회귀/화면 기준 검토 후 PR ready for review.');
}
