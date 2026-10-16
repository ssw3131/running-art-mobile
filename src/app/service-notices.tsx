import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { SupportPage } from '@/features/support/SupportPage';
import { SupportArt } from '@/features/support/SupportArt';
import { useNotices } from '@/features/support/use-notices';
import { useThemeColors } from '@/theme/ThemeProvider';
export default function ServiceNotices() {
  const c = useThemeColors(), { data, error, retry } = useNotices();
  return <SupportPage title="공지 사항"><SupportArt kind="notice" />
    {!data && !error && <ActivityIndicator accessibilityLabel="공지 불러오는 중" color={c.action} />}
    {!!error && <AppText accessibilityRole="alert">{error}</AppText>}
    {data?.offline && <AppText accessibilityRole="alert" variant="label">오프라인 저장본 · {new Date(data.fetchedAt).toLocaleDateString()} 확인. 최신 공지와 다를 수 있어요.</AppText>}
    {data?.notices.length === 0 && <AppText testID="notices-empty">게시된 공지가 없어요.</AppText>}
    {data?.notices.map(notice => <Pressable key={notice.id} testID={`notice-${notice.id}`} accessibilityRole="button" accessibilityLabel={notice.title}
      onPress={() => router.push({ pathname: '/service-notice', params: { id: notice.id } })}
      style={{ borderRadius: 20, borderWidth: 1, borderColor: c.divider, padding: 16, gap: 10, backgroundColor: c.surface }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><AppText variant="caption" weight="bold" style={{ color: c.onAction, backgroundColor: c.action, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>{notice.category}</AppText><AppText variant="label" style={{ color: c.muted }}>{new Date(notice.publishedAt).toLocaleDateString()}</AppText></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AppText weight="bold" style={{ flex: 1 }}>{notice.title}</AppText><Icon name="chevronRight" /></View>
    </Pressable>)}
    <Button label="공지 다시 확인" testID="notices-retry" variant="outline" onPress={retry} />
  </SupportPage>;
}
