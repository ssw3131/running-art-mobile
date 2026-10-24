import { Stack, useNavigationContainerRef } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppText } from '@/components/ui';
import { ServiceHeader } from '@/features/service/ServiceHeader';
import { useThemeColors } from '@/theme/ThemeProvider';
import { useAuth } from './use-auth';

// Explicit registration prevents automatic exposure of unclassified app pages.
// A route inventory test requires every new page to be classified here.
export const privateScreens = [
  ['(tabs)', ''], ['service-info', '서비스 안내 및 지원'], ['development', '개발 도구'],
  ['account-profile', '프로필 편집'], ['account-signup', '가입 정보 · 약관 동의'],
  ['account-settings', '설정'], ['account-sync', '개인 기록 동기화'], ['account-withdraw', '회원 탈퇴'],
  ['map', '내 주변 지도'], ['storage', '저장소 테스트'], ['courses/[id]', '코스 상세'],
  ['course-candidate', '코스 상세'], ['guidance', ''], ['runs/index', '러닝 기록 목록'], ['runs/[id]', '러닝 상세'],
  ['road-file-lab', '도로 파일 검증'], ['road-cache-lab', '영구 도로 캐시'], ['environment', '개발 환경'],
  ['ui-preview', 'UI 미리보기'], ['service-notices', '공지사항'], ['service-notice', '공지사항'],
  ['service-inquiry', '문의'], ['service-guide', '사용법'], ['service-faq', '자주 묻는 질문'],
  ['service-about', 'RunPen 소개'], ['run-result', '러닝 결과'], ['run-card', '공유하기'],
] as const;

type RouteState = { routeNames?: readonly string[]; routes: readonly { name: string; state?: RouteState }[] };
type ResetState = { index: number; routes: { name: string; state?: ResetState }[] };
function resetServiceState(state: RouteState, destination: string): ResetState | undefined {
  if (state.routeNames?.includes('service-policy')) return { index: 0, routes: [{ name: destination }] };
  for (const route of state.routes) {
    const nested = route.state && resetServiceState(route.state, destination);
    if (nested) return { index: 0, routes: [{ name: route.name, state: nested }] };
  }
}
export function ServiceStack() {
  const auth = useAuth(), c = useThemeColors();
  const navigation = useNavigationContainerRef();
  const identity = auth.account?.id ?? null;
  const previous = useRef({ ready: auth.ready, identity });
  useEffect(() => {
    if (!auth.ready) return;
    const changed = previous.current.ready && previous.current.identity !== identity;
    previous.current = { ready: true, identity };
    // A navigator key alone remounts views but preserves the container's route
    // state. Clear that state too, including shared policy/callback history.
    if (changed && navigation.isReady()) {
      const next = resetServiceState(navigation.getRootState(), identity ? '(tabs)' : 'account-entry');
      if (next) navigation.resetRoot(next);
    }
  }, [auth.ready, identity, navigation]);
  if (!auth.ready) return <View testID="auth-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
    <ActivityIndicator /><AppText>로그인 상태를 확인하고 있어요.</AppText>
  </View>;
  return <Stack screenOptions={{ contentStyle: { backgroundColor: c.background },
    header: ({ options }) => <ServiceHeader title={options.title ?? 'RunPen'} back menu={!!auth.account} /> }}>
    <Stack.Protected guard={!!auth.account}>
      {privateScreens.map(([name, title]) => <Stack.Screen key={name} name={name} options={{ title,
        headerShown: name !== '(tabs)' && name !== 'guidance',
        ...(name === 'service-info' || name === 'course-candidate' ? { header: () => <ServiceHeader title={title} back menu={false} /> } : {}),
      }} />)}
    </Stack.Protected>
    <Stack.Protected guard={!auth.account}>
      <Stack.Screen name="account-entry" options={{ headerShown: false }} />
    </Stack.Protected>
    <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    <Stack.Screen name="service-policy" options={{ title: '약관 및 정책', header: () => <ServiceHeader title="약관 및 정책" back menu={false} /> }} />
  </Stack>;
}
