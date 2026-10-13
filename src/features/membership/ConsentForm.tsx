import { useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { AppText, AppModal, Button, Checkbox, TextField } from '@/components/ui';
import { useThemeColors } from '@/theme/ThemeProvider';
import type { MembershipPolicy } from '@/modules/membership/model';

export function ConsentForm({ policy, email, nickname, onNickname, busy, message, profile, onSubmit }: {
  policy: MembershipPolicy; email: string; nickname: string; onNickname(value: string): void; busy: boolean;
  message: string; profile: ReactNode; onSubmit(): void;
}) {
  const c = useThemeColors();
  const [terms, setTerms] = useState(false), [privacy, setPrivacy] = useState(false);
  const [document, setDocument] = useState<'terms' | 'privacy' | null>(null);
  return <View style={{ gap: 30 }}>
    <View style={{ flexDirection: 'row', gap: 7 }}>
      <View style={{ minHeight: 54, padding: 12, borderRadius: 10, backgroundColor: c.divider, justifyContent: 'center' }}><AppText variant="caption" weight="bold" style={{ color: c.subtle }}>이메일</AppText></View>
      <View style={{ flex: 1, minHeight: 54, padding: 12, borderRadius: 10, backgroundColor: c.divider, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={require('../../../assets/signup/lock.svg')} style={{ width: 16, height: 16 }} accessible={false} />
        <AppText variant="label" selectable style={{ color: c.subtle, flex: 1 }}>{email || '이메일 정보가 없는 계정'}</AppText>
      </View>
    </View>
    <TextField label="닉네임 (선택)" testID="signup-nickname" value={nickname} onChangeText={onNickname} editable={!busy} autoCorrect={false} maxLength={80}
      hint="1~20자 · 비워 두면 기존 닉네임 또는 소셜 이름을 사용해요." returnKeyType="done" />
    {profile}
    <View style={{ gap: 8 }}>
      <Checkbox testID="signup-consent-all" label="필수 약관 전체 동의" checked={terms && privacy} disabled={busy} onChange={value => { setTerms(value); setPrivacy(value); }} />
      <View style={{ paddingLeft: 12, gap: 8 }}>
        <Checkbox testID="signup-consent-terms" label="[필수] 서비스 이용약관 동의" checked={terms} onChange={setTerms} disabled={busy} />
        <Button testID="signup-read-terms" label="서비스 이용약관 보기" variant="outline" compact onPress={() => setDocument('terms')} />
        <Checkbox testID="signup-consent-privacy" label="[필수] 개인정보 수집 및 이용 동의" checked={privacy} onChange={setPrivacy} disabled={busy} />
        <Button testID="signup-read-privacy" label="개인정보 수집 및 이용 내용 보기" variant="outline" compact onPress={() => setDocument('privacy')} />
      </View>
    </View>
    {!!message && <AppText testID="signup-message" accessibilityRole="alert">{message}</AppText>}
    <Button testID="signup-complete" label="완료" loading={busy} disabled={!terms || !privacy} onPress={onSubmit} />
    <AppModal visible={!!document} title={document === 'terms' ? '서비스 이용약관' : '개인정보 수집 및 이용'} onClose={() => setDocument(null)}
      footer={<Button label="닫기" onPress={() => setDocument(null)} />}>
      <AppText variant="caption">버전 {policy.id}</AppText>
      <AppText selectable style={{ alignSelf: 'stretch' }}>{document ? policy[document] : ''}</AppText>
    </AppModal>
  </View>;
}
