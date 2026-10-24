import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, AppModal, Button, Checkbox, Icon, TextField } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';
import type { MembershipPolicy } from '@/modules/membership/model';
import type { MembershipState } from '@/modules/membership/controller';
import { policyPublicationLabel } from '@/modules/membership/policy-presentation';

export function ConsentForm({ policy, policyStatus = policy ? 'ready' : 'unavailable', policyMessage = '', onRetryPolicy,
  email, nickname, onNickname, busy, message, profile, onSubmit }: {
  policy: MembershipPolicy | null; policyStatus?: MembershipState['policyStatus']; policyMessage?: string; onRetryPolicy?(): void;
  email: string; nickname: string; onNickname(value: string): void; busy: boolean;
  message: string; profile: ReactNode; onSubmit(): void;
}) {
  const c = useThemeColors();
  // Choices belong to a displayed version, never to whichever version arrives later.
  const [consent, setConsent] = useState({ id: policy?.id, terms: false, privacy: false });
  const terms = consent.id === policy?.id && consent.terms, privacy = consent.id === policy?.id && consent.privacy;
  const available = !!policy && policyStatus === 'ready';
  const change = (patch: Partial<{ terms: boolean; privacy: boolean }>) => setConsent({ id: policy?.id, terms, privacy, ...patch });
  const [document, setDocument] = useState<'terms' | 'privacy' | null>(null);
  return <View style={{ gap: 38 }}>
    <View style={{ flexDirection: 'row', gap: 7, marginHorizontal: 16 }}>
      <View style={{ minHeight: 54, minWidth: 71, padding: 12, borderRadius: 10, backgroundColor: c.divider, justifyContent: 'center', alignItems: 'center' }}><AppText variant="caption" weight="bold" style={{ color: c.subtle }}>이메일</AppText></View>
      <View style={{ flex: 1, minHeight: 54, padding: 12, borderRadius: 10, backgroundColor: c.divider, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={require('../../../assets/signup/lock.svg')} style={{ width: 16, height: 16 }} accessible={false} />
        <AppText variant="label" selectable style={{ color: c.subtle, flex: 1 }}>{email || '이메일 정보가 없는 계정'}</AppText>
      </View>
    </View>
    <View style={{ marginHorizontal: 9 }}><TextField label="닉네임" labelContent={<><AppText variant="heading" weight="bold">닉네임</AppText><AppText variant="label" weight="bold">(선택)</AppText></>}
      clearable style={{ minHeight: 56 }} testID="signup-nickname" value={nickname} onChangeText={onNickname} editable={!busy} autoCorrect={false} maxLength={80}
      accessibilityHint="1~20자. 비워 두면 기존 닉네임 또는 소셜 이름을 사용해요." returnKeyType="done" /></View>
    <View style={{ marginHorizontal: 9 }}>{profile}</View>
    <View style={{ gap: 14 }}>
      {available ? <>
        <Checkbox testID="signup-consent-all" label="필수 약관 전체 동의" labelProps={{ variant: 'heading', weight: 'bold', style: { color: c.muted } }}
          checked={terms && privacy} disabled={busy} onChange={value => change({ terms: value, privacy: value })} />
        <View style={{ paddingLeft: 22, gap: 4 }}>
          {(['terms', 'privacy'] as const).map(kind => <View key={kind} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}><Checkbox testID={`signup-consent-${kind}`} label={kind === 'terms' ? '[필수] 서비스 이용약관 동의' : '[필수] 개인정보 수집 및 이용 동의'}
              labelProps={{ weight: 'medium', style: { color: c.muted } }} checked={kind === 'terms' ? terms : privacy} onChange={value => change({ [kind]: value })} disabled={busy} /></View>
            <Pressable testID={`signup-read-${kind}`} accessibilityRole="button" accessibilityLabel={kind === 'terms' ? '서비스 이용약관 보기' : '개인정보 수집 및 이용 내용 보기'}
              onPress={() => setDocument(kind)} style={{ width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ transform: [{ scale: 0.5 }] }}><Icon name="chevronRight" /></View>
            </Pressable>
          </View>)}
        </View>
        <AppText variant="caption" style={{ color: c.muted }}>{policyPublicationLabel(policy.id, policy.publishedAt)}</AppText>
      </> : <View style={{ gap: 12 }}>
        {policyStatus === 'loading' && <ActivityIndicator accessibilityLabel="약관 불러오는 중" />}
        <AppText accessibilityRole="alert">{policyMessage || '가입 약관을 확인한 후 완료할 수 있어요. 입력한 프로필은 유지됩니다.'}</AppText>
        <Button testID="signup-retry-policy" label="약관 다시 확인" compact variant="outline" disabled={busy || policyStatus === 'loading'} onPress={() => onRetryPolicy?.()} />
      </View>}
      <Pressable accessibilityRole="link" accessibilityLabel="위치정보 이용약관 보기" onPress={() => router.push('/service-policy?kind=location')} style={{ minHeight: 48, justifyContent: 'center' }}>
        <AppText variant="label" style={{ color: c.muted, textDecorationLine: 'underline' }}>위치정보 이용약관 보기</AppText>
      </Pressable>
    </View>
    {!!message && <AppText testID="signup-message" accessibilityRole="alert">{message}</AppText>}
    <Button testID="signup-complete" label="완료" loading={busy} disabled={!available || !terms || !privacy} onPress={onSubmit} />
    <AppModal visible={!!document && available} title={document === 'terms' ? '서비스 이용약관' : '개인정보 수집 및 이용'} onClose={() => setDocument(null)}
      footer={<Button label="닫기" onPress={() => setDocument(null)} />}>
      <AppText variant="caption">버전 {policy?.id}</AppText>
      {!!policy && <AppText variant="caption">{policyPublicationLabel(policy.id, policy.publishedAt)}</AppText>}
      <AppText selectable style={{ alignSelf: 'stretch' }}>{document ? policy?.[document] ?? '' : ''}</AppText>
    </AppModal>
  </View>;
}
