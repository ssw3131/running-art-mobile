import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { SupportPage } from '@/features/support/SupportPage';
import { authClient } from '@/modules/auth/runtime';
import { useThemeColors } from '@/theme/ThemeProvider';

const titles = { terms: '이용약관', privacy: '개인정보 처리방침', location: '위치기반 서비스 이용약관' };
type Policy = { id: string; body: string; effectiveAt: string };
export default function ServicePolicy() {
  const { kind } = useLocalSearchParams<{ kind: string }>(), c = useThemeColors();
  const [state, setState] = useState<{ kind: string; loading: boolean; policy: Policy | null; error: string }>({ kind: '', loading: true, policy: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const valid = Object.hasOwn(titles, kind ?? ''), title = valid ? titles[kind as keyof typeof titles] : '약관 및 정책';
  useFocusEffect(useCallback(() => {
    let current = true;
    setState({ kind, loading: true, policy: null, error: '' });
    const read = async () => {
      if (!valid || !authClient) throw new Error('Unavailable');
      const { data, error } = await authClient.rpc('get_service_policy', { p_kind: kind });
      if (error) throw error;
      if (data && (typeof data.id !== 'string' || typeof data.body !== 'string' || !data.body.trim() || data.body.length > 100000 || !Number.isFinite(Date.parse(data.effectiveAt)))) throw new Error('Invalid policy');
      if (current) setState({ kind, loading: false, policy: data, error: '' });
    };
    void read().catch(() => { if (current) setState({ kind, loading: false, policy: null, error: '문서를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.' }); });
    return () => { current = false; };
    // Retry starts a fresh, cancellable read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, valid, attempt]));
  const shown = state.kind === kind ? state : { loading: true, policy: null, error: '' };
  return <SupportPage title={title}>
    {shown.loading ? <ActivityIndicator accessibilityLabel="정책 불러오는 중" color={c.action} /> : shown.policy ? <>
      <AppText variant="heading" weight="bold">RunPen {title}</AppText><AppText variant="caption" style={{ color: c.muted }}>버전 {shown.policy.id} · 시행 {new Date(shown.policy.effectiveAt).toLocaleDateString()}</AppText>
      <AppText selectable style={{ lineHeight: 28 }}>{shown.policy.body}</AppText>
    </> : <AppText accessibilityRole="alert">{shown.error || '현재 게시된 문서가 없습니다.'}</AppText>}
    <Button label="문서 다시 확인" variant="outline" onPress={() => setAttempt(value => value + 1)} />
  </SupportPage>;
}
