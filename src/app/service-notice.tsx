import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { SupportPage } from '@/features/support/SupportPage';
import { useNotices } from '@/features/support/use-notices';
import { useThemeColors } from '@/theme/ThemeProvider';
export default function ServiceNotice() {
  const { id } = useLocalSearchParams<{ id: string }>(), c = useThemeColors(), { data, error, retry } = useNotices();
  const notice = data?.notices.find(item => item.id === id);
  return <SupportPage title="공지 사항 상세">
    {!data && !error && <ActivityIndicator accessibilityLabel="공지 불러오는 중" color={c.action} />}
    {data?.offline && <AppText variant="label">오프라인 저장본 · {new Date(data.fetchedAt).toLocaleDateString()} 확인</AppText>}
    {notice ? <>
      <AppText variant="label" style={{ color: c.selected }}>{notice.category} · {new Date(notice.publishedAt).toLocaleDateString()}</AppText>
      <AppText variant="heading" weight="bold">{notice.title}</AppText><View style={{ borderBottomWidth: 1, borderColor: c.divider }} />
      <AppText selectable style={{ lineHeight: 28 }}>{notice.body}</AppText>
    </> : (data || error) && <AppText accessibilityRole="alert">{error || '현재 게시된 공지를 찾을 수 없어요.'}</AppText>}
    {!!error && <Button label="다시 확인" variant="outline" onPress={retry} />}
    <Button label="목록으로 돌아가기" onPress={() => router.canGoBack() ? router.back() : router.replace('/service-notices')} />
  </SupportPage>;
}
