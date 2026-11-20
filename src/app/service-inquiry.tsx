import { useCallback } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Button, Icon } from '@/components/ui';
import { useAuth } from '@/features/auth/use-auth';
import { SupportPage } from '@/features/support/SupportPage';
import { SupportArt } from '@/features/support/SupportArt';
import { InquiryForm } from '@/features/support/InquiryForm';
import { inquiryRemote, useInquiryResource } from '@/features/support/use-inquiry-resource';
import { useThemeColors } from '@/theme/ThemeProvider';

export default function ServiceInquiry() {
  const auth = useAuth();
  return auth.account ? <InquiryBoard key={auth.account.id} owner={auth.account.id} /> : <SupportPage title="문의 및 의견 보내기"><AppText>로그인 후 문의를 확인할 수 있어요.</AppText></SupportPage>;
}
function InquiryBoard({ owner }: { owner: string }) {
  const c = useThemeColors();
  const load = useCallback(() => inquiryRemote().list(), []);
  const { data, busy, error, reload, more } = useInquiryResource(load);
  const submitted = useCallback((id: string) => router.push({ pathname: '/service-inquiry-detail', params: { id } }), []);
  const hasItems = !!data?.items.length;
  return <SupportPage title="문의 및 의견 보내기" footer={hasItems ? <Button label="문의 및 의견 보내기" testID="inquiry-write" onPress={() => router.push('/service-inquiry-write')} /> : undefined}>
    {!data && busy && <ActivityIndicator accessibilityLabel="문의 불러오는 중" color={c.action} />}
    {!!error && <><AppText accessibilityRole="alert">{error}</AppText><Button label="다시 확인" testID="inquiry-list-retry" variant="outline" onPress={reload} /></>}
    {data && !hasItems && <InquiryForm owner={owner} onSubmitted={submitted} />}
    {hasItems && <><SupportArt kind="inquiry" /><AppText>본인과 RunPen 운영팀만 볼 수 있어요.</AppText>
      {data!.items.map(item => <Pressable key={item.id} testID={`inquiry-${item.id}`} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.answered ? '답변 완료' : '미확인'}`}
        onPress={() => router.push({ pathname: '/service-inquiry-detail', params: { id: item.id } })}
        style={{ borderRadius: 20, borderWidth: 1, borderColor: c.divider, padding: 16, gap: 10, backgroundColor: c.surface }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <AppText variant="caption" weight="bold" style={{ color: item.answered ? c.onAction : c.text, backgroundColor: item.answered ? c.action : c.secondary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>{item.answered ? '답변 완료' : '미확인'}</AppText>
          <AppText variant="label" style={{ color: c.muted }}>{new Date(item.receivedAt).toLocaleDateString()}</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AppText weight="bold" style={{ flex: 1 }}>{item.title}</AppText><Icon name="chevronRight" /></View>
      </Pressable>)}
      {data?.next && <Button label="더 보기" testID="inquiry-more" variant="outline" loading={busy} onPress={() => { void more(() => inquiryRemote().list(data.next), (previous, incoming) => ({ ...incoming, items: [...previous.items, ...incoming.items.filter(item => !previous.items.some(old => old.id === item.id))] })); }} />}
      <Button label="문의 다시 확인" testID="inquiry-refresh" variant="outline" disabled={busy} onPress={reload} />
    </>}
  </SupportPage>;
}
