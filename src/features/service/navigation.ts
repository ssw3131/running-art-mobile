/** Public paths are preserved so saved links and OAuth callbacks remain valid. */
export const serviceTabs = [
  { name: 'index', value: 'home', title: '홈', href: '/' },
  { name: 'route-lab', value: 'courses', title: '코스 생성', href: '/route-lab' },
  { name: 'run', value: 'run', title: '실시간 러닝', href: '/run' },
  { name: 'courses', value: 'archive', title: '기록 보관함', href: '/courses' },
  { name: 'account', value: 'account', title: '마이페이지', href: '/account' },
] as const;

export function archiveView(value: unknown): 'courses' | 'runs' {
  return value === 'runs' ? 'runs' : 'courses';
}
